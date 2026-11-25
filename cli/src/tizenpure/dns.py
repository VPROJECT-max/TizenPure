"""DNS blocklists: lint, export in resolver formats, and print setup guidance.

Bundled lists are TizenPure's own (MIT). HaGeZi's Samsung list is GPL-3.0, so it is
never bundled: `--hagezi` downloads it at run time, straight to the user's file, and
filters it against the allowlist.
"""

import re
import urllib.request
from pathlib import Path

DATA = Path(__file__).with_name("data") / "dns"
TIERS = {"safe": "samsung-ads.txt", "aggressive": "samsung-aggressive.txt"}
ALLOWLIST = "allowlist.txt"
HAGEZI_URL = "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/native.samsung-onlydomains.txt"
HAGEZI_MAX_BYTES = 4 * 1024 * 1024
DOMAIN = re.compile(r"^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$")
FORMATS = ("plain", "hosts", "adblock", "dnsmasq")

PUBLIC_RESOLVERS = {
    "AdGuard DNS (default filtering)": ("94.140.14.14", "94.140.15.15"),
    "AdGuard DNS (family)": ("94.140.14.15", "94.140.15.16"),
    "Control D (ads & tracking)": ("76.76.2.2", "76.76.10.2"),
}


def read_list(text):
    domains = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip().lower()
        if line:
            domains.append(line)
    return domains


def load(name):
    return read_list((DATA / name).read_text(encoding="utf-8"))


def blocks(blocked, domain):
    """True when blocking `blocked` (and its subdomains) would block `domain`."""
    return domain == blocked or domain.endswith("." + blocked)


def lint(lists=None, allow=None):
    """Return a list of problems; empty means the lists are safe to publish."""
    lists = lists if lists is not None else {tier: load(name) for tier, name in TIERS.items()}
    allow = allow if allow is not None else load(ALLOWLIST)
    problems = []
    for tier, domains in lists.items():
        seen = set()
        for domain in domains:
            if not DOMAIN.match(domain):
                problems.append(f"{tier}: invalid domain {domain!r}")
            if domain in seen:
                problems.append(f"{tier}: duplicate {domain}")
            seen.add(domain)
            for kept in allow:
                if blocks(domain, kept):
                    problems.append(f"{tier}: {domain} would block allowlisted {kept}")
    if "safe" in lists and "aggressive" in lists:
        missing = set(lists["safe"]) - set(lists["aggressive"])
        if missing:
            problems.append("aggressive tier must include the safe tier; missing: " + ", ".join(sorted(missing)))
    for domain in allow:
        if not DOMAIN.match(domain):
            problems.append(f"allowlist: invalid domain {domain!r}")
    return problems


def filter_allowed(domains, allow):
    return [d for d in domains if not any(blocks(d, kept) for kept in allow)]


def fetch_hagezi(url=HAGEZI_URL):
    with urllib.request.urlopen(url, timeout=30) as reply:
        data = reply.read(HAGEZI_MAX_BYTES + 1)
    if len(data) > HAGEZI_MAX_BYTES:
        raise ValueError("HaGeZi list is unexpectedly large; refusing.")
    return [d for d in read_list(data.decode("utf-8", errors="replace")) if DOMAIN.match(d.lstrip("*."))]


def render(domains, fmt):
    if fmt == "plain":
        lines = domains
    elif fmt == "hosts":
        lines = [f"0.0.0.0 {d}" for d in domains]
    elif fmt == "adblock":
        lines = [f"||{d}^" for d in domains]
    elif fmt == "dnsmasq":
        lines = [f"address=/{d}/0.0.0.0" for d in domains]
    else:
        raise ValueError(f"Unknown format {fmt}; choose one of {', '.join(FORMATS)}.")
    return "\n".join(lines) + "\n"


def export(tier="safe", fmt="plain", hagezi=False):
    allow = load(ALLOWLIST)
    domains = list(load(TIERS[tier]))
    if hagezi:
        extra = filter_allowed([d.lstrip("*.") for d in fetch_hagezi()], allow)
        domains += [d for d in extra if d not in domains]
    return render(filter_allowed(domains, allow), fmt)


def guide():
    lines = [
        "DNS blocking (reversible). Pick ONE path:",
        "",
        "A) Router / home resolver (most reliable; on-TV DNS may not persist on 2023 CU sets):",
        "   Load the exported list into Pi-hole / AdGuard Home / NextDNS, and add allowlist.txt",
        "   as the allowlist. Revert: remove the list.",
        "",
        "B) Public filtering DNS on the TV:",
        "   Settings > All Settings > Connection > Network > Network Status > IP Settings >",
        "   DNS Setting: Enter manually.",
    ]
    for name, (primary, secondary) in PUBLIC_RESOLVERS.items():
        lines.append(f"     {name}: {primary}  /  {secondary}")
    lines += [
        "   Then turn the TV fully off and on and re-open IP Settings: if DNS shows",
        "   'Obtain automatically' again, your firmware does not keep it; use path A.",
        "   Revert: DNS Setting > Obtain automatically.",
        "",
        "Keeps working by design: Samsung account, SmartThings, TV Plus / Live TV, firmware",
        "updates, the app store and all streaming apps (see dns/allowlist.txt).",
    ]
    return "\n".join(lines)
