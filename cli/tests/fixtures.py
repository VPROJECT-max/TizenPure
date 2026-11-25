"""Synthetic `0 vd_applist` replies (no real device data)."""


def block(store_id, title, tizen_id, removable=True, version="1.0.0"):
    pkg = tizen_id.split(".")[0] if not tizen_id.startswith(("org.", "com.")) else tizen_id
    rows = [
        ("app_id", store_id),
        ("app_title", title),
        ("app_version", version),
        ("app_tizen_id", tizen_id),
        ("app_package_name", pkg),
        ("app_size", "31457280"),
        ("use_count", "3"),
        ("is_removable", "1" if removable else "0"),
    ]
    return "\n".join(f"--------------{k:<36}={v}-------------" for k, v in rows)


SEP = "\n" + "-" * 93 + "\n"
DASHED = (
    "get app list...\napps count: 8"
    + SEP
    + SEP.join(
        [
            block("3201907018807", "Netflix", "org.tizen.netflix-app"),
            block("111299001912", "YouTube", "9Ur5IzDKqV.TizenYouTube"),
            block("3202311033054", "SmartThings", "com.samsung.tv.SmartThingsApp"),
            block("3201807016658", "Samsung Promotion", "yL49PNFmjW.PromotionApp"),
            block("20252100002", "User Guide", "25emanual2.emanual"),
            block("3202406035803", "Some Game", "gTNk0LKH5U.UiApp"),
            block("3202407036314", "SecurityCenter", "com.samsung.tv.SecurityCenter"),
            block("3202010022079", "Browser", "org.tizen.browser", removable=False),
        ]
    )
    + SEP
)

KEY_VALUE = "appid=AbCdEfGhIj.Demo name=Demo App app_version=2.0\nTotal: 1"
TABBED = "XyZaBcDeFg.Player\tMedia Player\n"
PLAIN = "QwErTyUiOp.Thing\n"
