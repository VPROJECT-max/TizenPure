"""Find Samsung Tizen TVs on the LAN. Read-only: SSDP M-SEARCH, then GET :8001/api/v2/.

Many TVs ignore ping, and PCs with several adapters (VPN, Hyper-V, Wi-Fi + Ethernet)
send multicast out of the wrong one, so we search from every local IPv4 address and
with several search targets. If SSDP finds nothing, an optional sweep of the local /24
asks each address for the read-only info endpoint.
"""

import concurrent.futures
import ipaddress
import re
import socket

from tizenpure import remote

SSDP_ADDR = ("239.255.255.250", 1900)
SSDP_TIMEOUT_S = 2.5
SEARCH_TARGETS = (
    b"urn:samsung.com:device:RemoteControlReceiver:1",
    b"urn:dial-multiscreen-org:service:dial:1",
    b"upnp:rootdevice",
)
SAMSUNG_REPLY = re.compile(rb"samsung|tizen", re.IGNORECASE)
SWEEP_TIMEOUT_S = 0.8
SWEEP_WORKERS = 64


def _msearch(target):
    return (
        b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n"
        b'MAN: "ssdp:discover"\r\nMX: 2\r\nST: ' + target + b"\r\n\r\n"
    )


def local_ipv4():
    """Every non-loopback IPv4 address of this PC."""
    found = set()
    try:
        for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(entry[4][0])
    except OSError:
        pass
    try:  # the address the default route would use
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1, never sent
            found.add(probe.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in found if not ip.startswith("127."))


def ssdp_hosts(timeout=SSDP_TIMEOUT_S):
    hosts = set()
    for interface in local_ipv4() or ["0.0.0.0"]:
        for target in SEARCH_TARGETS:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            try:
                sock.bind((interface, 0))
                if interface != "0.0.0.0":
                    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface))
                sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
                sock.settimeout(timeout)
                sock.sendto(_msearch(target), SSDP_ADDR)
                while True:
                    data, (ip, _port) = sock.recvfrom(8192)
                    if SAMSUNG_REPLY.search(data):
                        hosts.add(ip)
            except TimeoutError:
                pass
            except OSError:
                pass
            finally:
                sock.close()
    return hosts


def describe(ip):
    """Summarise one TV from its read-only info endpoint, or None if it isn't a Samsung TV."""
    try:
        device = remote.info(ip, timeout=3)
    except remote.TvUnreachable:
        return None
    if "samsung" not in str(device.get("type", "")).lower() and device.get("OS") != "Tizen":
        return None
    return {
        "ip": ip,
        "name": str(device.get("name", "")).replace("&quot;", '"'),
        "model": device.get("modelName"),
        "model_code": device.get("model"),
        "os": device.get("OS"),
        "power": device.get("PowerState"),
        "developerMode": device.get("developerMode"),
        "developerIP": device.get("developerIP"),
        "frame": device.get("FrameTVSupport") == "true",
    }


def sweep_hosts():
    """Ask every address of each local /24 for :8001 (used only if SSDP found nothing)."""
    candidates = set()
    for ip in local_ipv4():
        network = ipaddress.ip_network(f"{ip}/24", strict=False)
        candidates.update(str(host) for host in network.hosts() if str(host) != ip)

    def open_port(ip):
        try:
            with socket.create_connection((ip, remote.REST_PORT), timeout=SWEEP_TIMEOUT_S):
                return ip
        except OSError:
            return None

    with concurrent.futures.ThreadPoolExecutor(SWEEP_WORKERS) as pool:
        return {ip for ip in pool.map(open_port, sorted(candidates)) if ip}


def discover(sweep=True):
    hosts = ssdp_hosts()
    if not hosts and sweep:
        hosts = sweep_hosts()
    tvs = [tv for tv in (describe(ip) for ip in sorted(hosts)) if tv]
    return tvs
