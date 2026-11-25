"""Where TizenPure keeps private, per-user state on the PC (never inside the repo).

Windows:  %APPDATA%\\TizenPure\\
Others:   $XDG_CONFIG_HOME/tizenpure or ~/.config/tizenpure

    certs/<duid-hash>/   author.p12, distributor.p12, password.txt, device-profile.xml
    snapshots/           app-list snapshots taken before any change
    logs/                local logs (never uploaded)
    sessions/            per-TV lock files
"""

import hashlib
import os
from pathlib import Path

PRIVATE_DIR_MODE = 0o700
ENV_OVERRIDE = "TIZENPURE_HOME"


def root() -> Path:
    override = os.environ.get(ENV_OVERRIDE)
    if override:
        base = Path(override)
    elif os.name == "nt" and os.environ.get("APPDATA"):
        base = Path(os.environ["APPDATA"]) / "TizenPure"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "tizenpure"
    return base


def private_dir(*parts: str) -> Path:
    path = root().joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, PRIVATE_DIR_MODE)
    except OSError:
        pass  # Windows ACLs already scope %APPDATA% to the user.
    return path


def tv_key(duid: str) -> str:
    """A stable, non-reversible folder name for one TV, so paths never expose the DUID."""
    return hashlib.sha256(duid.strip().encode()).hexdigest()[:16]


def cert_dir(duid: str) -> Path:
    return root() / "certs" / tv_key(duid)
