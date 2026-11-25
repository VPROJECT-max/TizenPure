import pytest


@pytest.fixture(autouse=True)
def private_home(tmp_path, monkeypatch):
    """Never touch the real %APPDATA%\\TizenPure during tests."""
    monkeypatch.setenv("TIZENPURE_HOME", str(tmp_path / "state"))
