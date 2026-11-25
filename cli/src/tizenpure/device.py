"""Own one SDB connection to one TV, serialised across threads and CLI processes.

The TV accepts a single SDB session at a time; a second TizenPure process waiting on
the same TV gets a clear error instead of a confusing reset. Ported from AeroTizen
(MIT) with the root-provider handoff removed: TizenPure never uses root.
"""

import hashlib
import os
import threading

from tizenpure import state
from tizenpure.sdb import PORT, Sdb, SdbError


class DeviceSessionError(SdbError):
    pass


class DeviceSession:
    def __init__(self, host, port=PORT, timeout=15, *, lock_dir=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.lock_dir = lock_dir
        self._mutex = threading.RLock()
        self._lock_file = None
        self._connection = None

    def _acquire(self):
        if self._lock_file is not None:
            return
        lock_dir = self.lock_dir or state.private_dir("sessions")
        os.makedirs(lock_dir, exist_ok=True)
        key = hashlib.sha256(f"{self.host.lower()}:{self.port}".encode()).hexdigest()[:24]
        handle = open(os.path.join(lock_dir, f"{key}.lock"), "a+b")
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            handle.close()
            raise DeviceSessionError("Another TizenPure command is using this TV; wait for it and retry.") from exc
        self._lock_file = handle

    def connect(self):
        with self._mutex:
            if self._connection is not None:
                return self
            self._acquire()
            try:
                self._connection = Sdb(self.host, port=self.port, timeout=self.timeout).connect()
            except BaseException:
                self.close()
                raise
            return self

    def close(self):
        with self._mutex:
            try:
                if self._connection is not None:
                    self._connection.close()
            finally:
                self._connection = None
                if self._lock_file is not None:
                    self._lock_file.close()
                    self._lock_file = None

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    def _call(self, method, *args):
        with self._mutex:
            if self._connection is None:
                raise DeviceSessionError("No TV connection is active.")
            return getattr(self._connection, method)(*args)

    @property
    def banner(self):
        return self._call("__getattribute__", "banner")

    def capability(self):
        return self._call("capability")

    def duid(self):
        return self._call("duid")

    def applist(self):
        return self._call("applist")

    def shell(self, command):
        return self._call("shell", command)

    def push(self, data, path):
        return self._call("push", data, path)

    def install(self, app_id, data, tool_path):
        return self._call("install", app_id, data, tool_path)

    def uninstall(self, app_id):
        return self._call("uninstall", app_id)

    def launch(self, app_id):
        return self._call("launch", app_id)

    def debug_launch(self, app_id):
        return self._call("debug_launch", app_id)

    def forward(self, local_port, remote_port):
        return self._call("forward", local_port, remote_port)
