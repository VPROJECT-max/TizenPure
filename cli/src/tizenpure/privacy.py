"""The guided on-TV privacy checklist. TizenPure cannot (and does not) change these for you:
every toggle is made by you, on the TV, and can be switched back in the same menu."""

CHECKLIST = (
    (
        "Viewing data and ads",
        "Settings > All Settings > General & Privacy > Terms & Privacy > Privacy Choices",
        (
            "Viewing Information Services (ACR): Off",
            "Interest-Based Advertisement: Off",
            "Voice Recognition Services: Off (unless you use voice)",
            "Personalised content / Customisation Service / Recommendations: Off",
            "Reset PSID (advertising id): run once",
        ),
    ),
    (
        "Start screen",
        "Settings > All Settings > General & Privacy > Start Screen Options "
        "(Tizen 9: All Settings > Advanced Features > Start Screen Options)",
        (
            "Start with Smart Hub Home: Off (TizenPure's watcher opens the launcher instead)",
            "Autorun Last App: your choice",
            "Autorun Samsung TV Plus: Off (TV Plus itself keeps working from the launcher)",
        ),
    ),
    (
        "Keep these ON (you asked for them to keep working)",
        "Settings > Support > Software Update / Settings > General & Privacy > Samsung Account",
        (
            "Auto Update (firmware): On",
            "Samsung account: stay signed in (SmartThings, TV Plus)",
            "SmartThings: unchanged",
        ),
    ),
    (
        "Security (after installing TizenPure)",
        "Apps > Settings (gear) > type 1 2 3 4 5 on the remote > Developer Mode",
        (
            "Developer Mode: Off when you are done (Samsung SVE-2025-50109 lets a device at the",
            "  Host PC IP run commands while it is on). TizenPure keeps running; turn it back on",
            "  only to update or uninstall TizenPure from the PC.",
        ),
    ),
)


def render():
    lines = ["Privacy checklist (do these on the TV; each is reversible in the same menu)", ""]
    for number, (title, path, items) in enumerate(CHECKLIST, 1):
        lines.append(f"{number}. {title}")
        lines.append(f"   {path}")
        lines.extend(f"   [ ] {item}" if not item.startswith("  ") else f"       {item.strip()}" for item in items)
        lines.append("")
    lines.append("Labels differ slightly by year and region; search Settings for the option name if needed.")
    return "\n".join(lines)
