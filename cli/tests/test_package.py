import pytest
from fixtures import DASHED, block

from tizenpure import package

HELLO_LIST = DASHED + block("TizenPureH", "TizenPure Hello", "TizenPureH.Hello", version="1.0.0")


def test_verify_install_accepts_read_back():
    out = "install TizenPureH.Hello\npackage_path /x/TizenPureH.wgt\nspend time for wascmd is [1ms]\n"
    assert package.verify_install("TizenPureH.Hello", "1.0.0", out, HELLO_LIST)["version"] == "1.0.0"


def test_verify_install_rejects_errors_and_missing_apps():
    with pytest.raises(ValueError):
        package.verify_install("TizenPureH.Hello", "1.0.0", "install failed[118, -12]", HELLO_LIST)
    with pytest.raises(ValueError):
        package.verify_install("TizenPureH.Hello", "1.0.0", "ok", DASHED)
    with pytest.raises(ValueError):
        package.verify_install("TizenPureH.Hello", "2.0.0", "ok", HELLO_LIST)


class FakeSession:
    def __init__(self, listing):
        self.listing, self.calls = listing, []

    def uninstall(self, app_id):
        self.calls.append(app_id)
        self.listing = DASHED
        return "uninstall completed"

    def applist(self):
        return self.listing


def test_uninstall_only_touches_own_apps():
    with pytest.raises(ValueError):
        package.uninstall(FakeSession(DASHED), "9Ur5IzDKqV.TizenYouTube")
    session = FakeSession(HELLO_LIST)
    package.uninstall(session, "TizenPureH.Hello")
    assert session.calls == ["TizenPureH.Hello"]
