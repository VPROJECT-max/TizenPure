from tizenpure import autostart


def test_power_on_edge_only():
    assert autostart.is_power_on_edge("unreachable", "on")
    assert autostart.is_power_on_edge("standby", "on")
    assert not autostart.is_power_on_edge("on", "on")
    assert not autostart.is_power_on_edge("on", "standby")


def test_never_covers_an_app_on_screen():
    assert autostart.decide(launcher_visible=False, other_visible=True, elapsed_s=0) == "stop"
    assert autostart.decide(launcher_visible=True, other_visible=False, elapsed_s=0) == "done"
    assert autostart.decide(launcher_visible=False, other_visible=False, elapsed_s=5) == "launch"
    assert autostart.decide(launcher_visible=False, other_visible=False, elapsed_s=999) == "stop"


def test_open_after_power_on_retries_until_visible():
    t = {"now": 0.0}
    shown = {"after": 2, "launches": 0}

    def clock():
        return t["now"]

    def sleep(s):
        t["now"] += s

    def status(_host, app):
        if app == autostart.LAUNCHER_ID:
            return {"running": True, "visible": shown["launches"] >= shown["after"]}
        return {"running": True, "visible": False}

    def opener(_host):
        shown["launches"] += 1
        return True

    assert autostart.open_after_power_on("tv", lambda m: None, clock, sleep, status, opener)
    assert shown["launches"] == 2  # first launch covered by the TV's own startup, retry wins


def test_leaves_a_streaming_app_alone():
    opened = []

    def status(_host, app):
        return {"running": True, "visible": app == "3201907018807"}

    t = {"now": 0.0}
    result = autostart.open_after_power_on(
        "tv", lambda m: None, lambda: t["now"], lambda s: t.__setitem__("now", t["now"] + s), status, opened.append
    )
    assert result is False and opened == []


def test_startup_script_quotes_paths():
    script = autostart.vbs_script([r"C:\Program Files\tp\tizenpure.exe", "--tv", "10.0.0.5", "autostart", "run"])
    assert script.startswith('CreateObject("WScript.Shell").Run "')
    assert r'"""C:\Program Files\tp\tizenpure.exe""' in script and ", 0, False" in script


def test_only_one_helper_runs(tmp_path):
    lock = tmp_path / "autostart.lock"
    assert autostart.single_instance(lock)
    import subprocess
    import sys

    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); from tizenpure import autostart; "
        "print(autostart.single_instance(sys.argv[2]))"
    )
    src = str(__import__("pathlib").Path(autostart.__file__).parents[1])
    out = subprocess.run([sys.executable, "-c", code, src, str(lock)], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False"
