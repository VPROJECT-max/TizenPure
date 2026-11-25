from fixtures import DASHED, KEY_VALUE, PLAIN, TABBED

from tizenpure import catalog


def test_parses_dashed_blocks():
    apps = catalog.parse_applist(DASHED)
    assert len(apps) == 8
    yt = next(a for a in apps if a["name"] == "YouTube")
    assert yt["store_id"] == "111299001912" and yt["pkgid"] == "9Ur5IzDKqV" and yt["removable"]


def test_parses_older_formats():
    assert catalog.parse_applist(KEY_VALUE)[0]["appid"] == "AbCdEfGhIj.Demo"
    assert catalog.parse_applist(TABBED)[0]["name"] == "Media Player"
    assert catalog.parse_applist(PLAIN)[0]["appid"] == "QwErTyUiOp.Thing"


def test_streaming_and_kept_services_are_never_bloat():
    pkgs = catalog.packages(DASHED)
    by_name = {v["name"]: v["class"] for v in pkgs.values()}
    assert by_name["Netflix"] == "keep"
    assert by_name["YouTube"] == "keep"
    assert by_name["SmartThings"] == "keep"
    assert by_name["Samsung Promotion"] == "bloat"
    assert by_name["User Guide"] == "bloat"
    assert by_name["Some Game"] == "optional"
    assert by_name["SecurityCenter"] == "protected"
    assert by_name["Browser"] == "protected"


def test_every_known_streaming_name_is_kept():
    for name in [
        "Disney+",
        "Prime Video",
        "HBO Max",
        "Apple Music",
        "Spotify",
        "Twitch",
        "Rakuten TV",
        "Samsung TV Plus",
        "Plex",
    ]:
        app = {"appid": "AbCdEfGhIj.X", "pkgid": "AbCdEfGhIj", "name": name, "removable": True}
        assert catalog.classify(app) == "keep", name


def test_own_packages_are_protected_from_debloat():
    for pkg in catalog.OWN_PACKAGES:
        assert (
            catalog.classify({"appid": pkg + ".Home", "pkgid": pkg, "name": "TizenPure", "removable": True})
            == "protected"
        )
