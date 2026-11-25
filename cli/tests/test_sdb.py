"""SDB framing against a fake sdbd on localhost."""

import socket
import struct
import threading

from tizenpure import sdb


def frame(cmd, a0, a1, payload=b""):
    return struct.pack("<6I", cmd, a0, a1, len(payload), sum(payload) & 0xFFFFFFFF, cmd ^ 0xFFFFFFFF) + payload


def read_frame(conn):
    head = b""
    while len(head) < 24:
        head += conn.recv(24 - len(head))
    cmd, a0, a1, n, _c, _m = struct.unpack("<6I", head)
    body = b""
    while len(body) < n:
        body += conn.recv(n - len(body))
    return cmd, a0, a1, body


def fake_sdbd(replies):
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    seen = []

    def run():
        conn, _ = server.accept()
        cmd, *_ = read_frame(conn)
        assert cmd == sdb.CNXN
        conn.sendall(frame(sdb.CNXN, sdb.VERSION, 4096, b"device::FAKE::0\0"))
        while True:
            try:
                cmd, a0, _a1, body = read_frame(conn)
            except (OSError, struct.error):
                return
            if cmd == sdb.OPEN:
                name = body.rstrip(b"\0").decode()
                seen.append(name)
                conn.sendall(frame(sdb.OKAY, 77, a0))
                conn.sendall(frame(sdb.WRTE, 77, a0, replies.get(name, b"")))
                read_frame(conn)  # OKAY for our WRTE
                conn.sendall(frame(sdb.CLSE, 77, a0))
            elif cmd == sdb.CLSE:
                continue

    threading.Thread(target=run, daemon=True).start()
    return server.getsockname()[1], seen


def test_handshake_and_shell_round_trip():
    port, seen = fake_sdbd(
        {"shell:0 getduid": b"FAKE-DUID-123\n", "capability:": b"platform_version:9.0\ncpu_arch:armv7\n"}
    )
    s = sdb.Sdb("127.0.0.1", port=port, timeout=5).connect()
    try:
        assert s.banner == "device::FAKE::0"
        assert s.duid() == "FAKE-DUID-123"
        assert s.capability()["platform_version"] == "9.0"
    finally:
        s.close()
    assert seen == ["shell:0 getduid", "capability:"]


def test_handshake_identifies_as_tizenpure():
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    got = {}

    def run():
        conn, _ = server.accept()
        got["frame"] = read_frame(conn)
        conn.close()

    threading.Thread(target=run, daemon=True).start()
    try:
        sdb.Sdb("127.0.0.1", port=server.getsockname()[1], timeout=2).connect(attempts=1)
    except sdb.SdbError:
        pass
    assert got["frame"][3] == b"host::tizenpure\0"
