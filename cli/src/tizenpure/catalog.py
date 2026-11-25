"""Parse `0 vd_applist` and classify installed packages.

Classes, from most to least protected:

  protected  platform/infrastructure, or the TV says it is not removable. Never removed.
  keep       streaming, music, live-TV and account services the user relies on
             (Netflix, YouTube, Disney+, TV Plus, SmartThings, ...). `debloat` refuses
             these unless the user names them *and* passes --allow-keep.
  bloat      almost never wanted (promotion, e-manual, demo/retail, tips).
  optional   everything else store-installed; removed only when named explicitly.

Parsing ported from AeroTizen (MIT). Classification rewritten for TizenPure so that no
third-party streaming app is ever auto-selected for removal.
"""

import re

STORE_PKG = re.compile(r"^[A-Za-z0-9]{10}$")
TIZENPURE_PKG = "TizenPure0"
HELLO_PKG = "TizenPureH"
OWN_PACKAGES = {TIZENPURE_PKG, HELLO_PKG}

PROTECTED_PKGS = {
    TIZENPURE_PKG,  # this project's own launcher (use `tizenpure uninstall`)
    HELLO_PKG,  # the hello-world signing test (use `tizenpure uninstall hello`)
    "ZODRT12q2l",  # WebAccountExtension (account plumbing)
    "aQjWjLsPaO",  # MultiScreenWebLauncher (casting)
    "30IKH0OX8U",  # Aria video background services
    "com.samsung.tv.SecurityCenter",  # reported removable on Tizen 9, but is a security component
    "org.tizen.browser",  # Samsung's built-in browser
}
PROTECTED_NAME_HINTS = ("lowmem", "webaccount", "multiscreen", "adplayer", "launcher", "security")

# Matched against lower-cased name and app id. Anything that streams video/music, is
# live TV, or is a Samsung service the user asked to keep working.
KEEP_HINTS = (
    "netflix",
    "youtube",
    "prime video",
    "primevideo",
    "disney",
    "hbo",
    "max",
    "hulu",
    "apple tv",
    "apple music",
    "appletv",
    "spotify",
    "deezer",
    "tidal",
    "amazon music",
    "paramount",
    "peacock",
    "skyshowtime",
    "now tv",
    "dazn",
    "crunchyroll",
    "mubi",
    "plex",
    "jellyfin",
    "emby",
    "kodi",
    "pluto",
    "tubi",
    "rakuten",
    "wuaki",
    "canal",
    "megogo",
    "sweet.tv",
    "voyo",
    "antena",
    "focus sat",
    "digi",
    "orange tv",
    "hbo go",
    "twitch",
    "vimeo",
    "dailymotion",
    "tv plus",
    "tvplus",
    "samsung tv plus",
    "live tv",
    "smartthings",
    "samsung account",
    "geforce",
    "xbox",
    "steam link",
    "playstation",
    "tiktok",
    "facebook",
    "iptv",
    "arte",
    "bbc",
    "itv",
    "zdf",
    "ard",
    "rai",
    "rtl",
    "france.tv",
    "molotov",
    "viaplay",
    "ruutu",
    "salto",
    "joyn",
    "waipu",
    "zattoo",
)

BLOAT_HINTS = (
    "promotion",
    "e-manual",
    "emanual",
    "user guide",
    "ghidul utilizatorului",
    "demo",
    "retail",
    "store mode",
    "tips",
    "samsung health",
    "workout",
)
BLOAT_PKG_HINTS = ("emanual", "promotionapp", "retail", "demo")

CLASSES = ("protected", "keep", "bloat", "optional")

BLOCK_FIELD = re.compile(r"-{3,}([\w():,]+?)\s*=(.*?)-{5,}\s*$", re.M)


def parse_blocks(text):
    """Newer firmware (Tizen 6+) prints one dashed block of `key =value` per app."""
    apps = []
    for block in re.split(r"\n-{20,}\s*\n", text):
        fields = dict((k.strip(), v.strip()) for k, v in BLOCK_FIELD.findall(block))
        if "app_id" not in fields:
            continue
        tizen_id = fields.get("app_tizen_id") or fields["app_id"]
        apps.append(
            {
                "appid": tizen_id,
                "pkgid": fields.get("app_package_name") or tizen_id.split(".")[0],
                "name": fields.get("app_title") or tizen_id,
                "store_id": fields["app_id"],
                "removable": fields.get("is_removable") == "1",
                "size_mb": int(fields.get("app_size") or 0) // (1024 * 1024),
                "uses": int(fields.get("use_count") or 0),
                "version": fields.get("app_version") or None,
            }
        )
    return apps


def parse_applist(text):
    """Parse `0 vd_applist` output into [{appid, pkgid, name, ...}].

    Handles dashed per-app blocks (Tizen 6+), `key=value` and tab-separated lines of
    older firmware, and plain one-id-per-line output.
    """
    if "app_tizen_id" in text:
        return parse_blocks(text)
    apps = []
    for raw in text.splitlines():
        line = raw.strip()
        if (
            not line
            or line.startswith(("---", "=", "#"))
            or line.lower().startswith(("total", "get app", "apps count"))
        ):
            continue
        fields = dict(re.findall(r"(\w+)\s*[=:]\s*\[?([^\]\t,]+?)\]?(?=\s+\w+\s*[=:]|\s*$|\t|,)", line))
        appid = fields.get("app_tizen_id") or fields.get("appid") or fields.get("app_id") or fields.get("id")
        name = fields.get("app_title") or fields.get("name") or fields.get("title")
        if not appid:
            parts = re.split(r"\t+|\s{2,}", line)
            appid = parts[0]
            name = name or (parts[1] if len(parts) > 1 else None)
        appid = appid.strip()
        if not re.match(r"^[\w.\-]+$", appid):
            continue
        apps.append(
            {
                "appid": appid,
                "pkgid": appid.split(".")[0] if "." in appid else appid,
                "name": (name or appid).strip(),
                "version": fields.get("app_version") or None,
            }
        )
    return apps


def _matches(hints, *texts):
    haystack = " ".join(t.lower() for t in texts if t)
    return any(hint in haystack for hint in hints)


def classify(app):
    """Return one of CLASSES for a single app."""
    pkgid, name, appid = app["pkgid"], app.get("name", ""), app["appid"]
    if pkgid in PROTECTED_PKGS or appid.split(".")[0] in PROTECTED_PKGS:
        return "protected"
    if "removable" in app:
        if not app["removable"]:
            return "protected"
    elif not STORE_PKG.match(pkgid):
        return "protected"
    if _matches(PROTECTED_NAME_HINTS, appid, name):
        return "protected"
    if _matches(KEEP_HINTS, appid, name):
        return "keep"
    if _matches(BLOAT_HINTS, name) or _matches(BLOAT_PKG_HINTS, appid):
        return "bloat"
    return "optional"


def packages(applist_text):
    """Group apps into packages: {pkgid: {"apps": [...], "class": ..., "name": ...}}.

    A package is removed as a unit, so its most protective class wins.
    """
    pkgs = {}
    for app in parse_applist(applist_text):
        pkgs.setdefault(app["pkgid"], {"apps": []})["apps"].append(app)
    for pkg in pkgs.values():
        classes = {classify(a) for a in pkg["apps"]}
        pkg["class"] = next(c for c in CLASSES if c in classes)
        pkg["name"] = min((a["name"] for a in pkg["apps"]), key=len)
    return pkgs
