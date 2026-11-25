"""`tizenpure autostart`: open TizenPure when the TV powers on, from an always-on PC.

Why this exists: on retail Samsung TVs a background service signed with a free (public)
certificate never starts at boot; that needs Samsung partner privileges. Samsung's own
"Autorun Last App" covers power-on from standby but not after a power cut. The TV's local
API, however, opens an installed app on request, so a PC on the same network can do it.

What it touches: only GET http://<tv>:8001/api/v2/ (power state), GET .../applications/<id>
(is something on screen?) and POST .../applications/TizenPure0.Home (open TizenPure).
No Developer Mode, no SDB, no pairing. It never opens TizenPure over an app that is on screen.
"""

import time
import urllib.error
import urllib.request

from tizenpure import remote

LAUNCHER_ID = "TizenPure0.Home"
POLL_S = 3
SETTLE_S = 6  # let the TV finish its own startup before the first try
RETRY_AT_S = (0, 10, 25)  # the TV's startup can cover the first launch (seen on 2019-2023 sets)
GIVE_UP_S = 60
# Apps whose being on screen means "the user chose something": never cover them.
WATCH_IDS = ("3201907018807", "111299001912", "3201910019365", "3201901017640")


def power_state(host):
    try:
        return remote.info(host, timeout=2).get("PowerState") or "on"
    except remote.TvUnreachable:
        return "unreachable"


def launch(host, app_id=LAUNCHER_ID):
    request = urllib.request.Request(
        f"http://{host}:{remote.REST_PORT}{remote.APPS_PATH}{app_id}", method="POST", data=b""
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as reply:
            return reply.status == 200 and reply.read().strip() == b"true"
    except (OSError, urllib.error.HTTPError):
        return False


def is_power_on_edge(previous, current):
    """Fire only when the TV goes from off/standby/unreachable to on."""
    return current == "on" and previous in ("unreachable", "standby", "off", None)


def decide(launcher_visible, other_visible, elapsed_s):
    """What to do during the post-power-on window: 'done', 'launch', 'wait' or 'stop'."""
    if launcher_visible:
        return "done"
    if other_visible:
        return "stop"  # the user (or Autorun Last App) already opened something: leave it
    if elapsed_s > GIVE_UP_S:
        return "stop"
    return "launch"


def open_after_power_on(host, log, clock=time.monotonic, sleep=time.sleep, status=remote.app_status, opener=launch):
    sleep(SETTLE_S)
    start = clock()
    for at in RETRY_AT_S:
        while clock() - start < at:
            sleep(1)
        me = status(host, LAUNCHER_ID) or {}
        other = [i for i in WATCH_IDS if (status(host, i) or {}).get("visible")]
        action = decide(bool(me.get("visible")), bool(other), clock() - start)
        if action == "done":
            log("TizenPure is on screen.")
            return True
        if action == "stop":
            log("Another app is on screen; leaving it alone." if other else "Gave up.")
            return False
        log(f"Opening TizenPure (attempt at +{at} s): {'accepted' if opener(host) else 'refused'}")
        sleep(3)
    me = status(host, LAUNCHER_ID) or {}
    return bool(me.get("visible"))


def single_instance(lock_path):
    """Hold an exclusive lock for this process's lifetime; False if another helper has it."""
    import os

    handle = open(lock_path, "a+b")
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return False
    single_instance.handle = handle  # keep the lock open until exit
    return True


def run(host, log=print, sleep=time.sleep, lock_path=None):  # pragma: no cover - endless loop
    if lock_path is not None and not single_instance(lock_path):
        log("Another autostart helper is already running; exiting.")
        return
    log(f"Watching {host}: TizenPure opens whenever the TV powers on. Ctrl+C to stop.")
    previous = power_state(host)
    while True:
        current = power_state(host)
        if is_power_on_edge(previous, current):
            log(f"{time.strftime('%H:%M:%S')} TV powered on.")
            open_after_power_on(host, log)
        previous = current
        sleep(POLL_S)


# -- Windows: start the helper hidden at logon via the user's Startup folder (no admin) --

STARTUP_NAME = "TizenPure autostart.vbs"


def startup_dir():
    import os
    from pathlib import Path

    return Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def command_line(host):
    """How to re-run this CLI: the frozen exe, the installed launcher script, or python -m."""
    import sys
    from pathlib import Path

    if getattr(sys, "frozen", False):
        base = [sys.executable]
    elif Path(sys.argv[0]).suffix.lower() == ".exe" and Path(sys.argv[0]).exists():
        base = [str(Path(sys.argv[0]).resolve())]
    else:
        base = [sys.executable, "-m", "tizenpure"]
    return base + ["--tv", host, "autostart", "run", "--log"]


def vbs_script(argv):
    quoted = " ".join('""' + a + '""' for a in argv)
    return 'CreateObject("WScript.Shell").Run "' + quoted + '", 0, False\r\n'
