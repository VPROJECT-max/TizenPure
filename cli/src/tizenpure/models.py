"""Model gating: which TVs may receive which kinds of change.

Tiers
  verified    every TizenPure command is allowed (still gated by preflight + confirm).
  unverified  read-only commands plus installing/uninstalling TizenPure's own app.

A model is verified only after the on-TV acceptance sequence in docs/compatibility.md
has passed on that exact model. Add entries by pull request with the report attached.
"""

import re

# Exact model names (as reported by :8001/api/v2/ `modelName`) that passed acceptance.
VERIFIED_MODELS = {
    # Crystal UHD CU7172 (2023, Tizen 9.0). The 65" sibling is attested by AeroTizen's
    # compatibility table; the 55" passed TizenPure's read-only doctor (M1).
    "UE55CU7172UXXH": 'Crystal UHD CU7172 55" (2023)',
    "UE65CU7172UXXH": 'Crystal UHD CU7172 65" (2023)',
}

# Minimum platform: the launcher targets Chromium 63+ (Tizen 5.0+).
MIN_PLATFORM_VERSION = 5.0

READ_ONLY = "read-only"
APP_LEVEL = "app-level"  # install/uninstall TizenPure's own package
STORE_APPS = "store-apps"  # remove user-removable store apps (debloat)

ALLOWED = {
    "verified": {READ_ONLY, APP_LEVEL, STORE_APPS},
    "unverified": {READ_ONLY, APP_LEVEL},
    "unsupported": {READ_ONLY},
}


def platform_version(text):
    match = re.match(r"\s*(\d+(?:\.\d+)?)", str(text or ""))
    return float(match.group(1)) if match else 0.0


def tier(model_name, platform=None):
    if platform is not None and 0 < platform_version(platform) < MIN_PLATFORM_VERSION:
        return "unsupported"
    return "verified" if (model_name or "").strip().upper() in VERIFIED_MODELS else "unverified"


def allows(model_name, action, platform=None):
    return action in ALLOWED[tier(model_name, platform)]


def year_from_model_code(code):
    """'23_KSUE_UB_T09' -> 2023; None when unknown."""
    match = re.match(r"(\d{2})_", str(code or ""))
    return 2000 + int(match.group(1)) if match else None
