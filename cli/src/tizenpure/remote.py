"""Read-only access to the TV's local REST API on port 8001 (no pairing, no Developer Mode).

Only GET requests are made here. Nothing in this module changes TV state.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

REST_PORT = 8001
INFO_PATH = "/api/v2/"
APPS_PATH = "/api/v2/applications/"
INFO_TIMEOUT_S = 5
STATUS_TIMEOUT_S = 3
MAX_REPLY_BYTES = 256 * 1024


class TvUnreachable(Exception):
    pass


def _get_json(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout) as reply:
        return json.loads(reply.read(MAX_REPLY_BYTES).decode("utf-8", errors="replace"))


def info(host, timeout=INFO_TIMEOUT_S):
    """Return the `device` object from http://<host>:8001/api/v2/."""
    try:
        data = _get_json(f"http://{host}:{REST_PORT}{INFO_PATH}", timeout)
    except (OSError, ValueError) as error:
        raise TvUnreachable(
            f"Can't reach the TV at {host} ({getattr(error, 'reason', error)}). Is it on and finished booting?"
        ) from error
    device = data.get("device") if isinstance(data, dict) else None
    if not isinstance(device, dict):
        raise TvUnreachable(f"{host} answered, but not like a Samsung TV.")
    return device


def app_status(host, store_id, timeout=STATUS_TIMEOUT_S):
    """{'running': bool, 'visible': bool, ...} for one store/app id, or None when unknown."""
    try:
        value = _get_json(f"http://{host}:{REST_PORT}{APPS_PATH}{urllib.parse.quote(store_id, safe='')}", timeout)
    except (OSError, ValueError, urllib.error.HTTPError):
        return None
    if isinstance(value, dict) and isinstance(value.get("running"), bool) and isinstance(value.get("visible"), bool):
        return value
    return None
