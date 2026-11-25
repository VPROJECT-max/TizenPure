"""`tizenpure watcher probe`: measure, from the PC, which apps report `visible`.

The watcher can only return you from an app that tells the TV's local API it is on
screen. This read-only probe polls GET :8001/api/v2/applications/<id> for every
installed app while you open your streaming apps one by one, and reports:

  reports-visible   Home inside this app returns to TizenPure.
  silent            the app never said it was visible; the watcher stands aside while
                    it runs (playback is never interrupted, but Home won't return).
  not-opened        the app did not run during the probe.
"""

import concurrent.futures
import time

from tizenpure import catalog, remote

POLL_INTERVAL_S = 0.5
WORKERS = 8


def store_ids(applist_text):
    return {a["store_id"]: a["name"] for a in catalog.parse_applist(applist_text) if a.get("store_id")}


def probe(host, ids, seconds, on_tick=None, clock=time.monotonic, sleep=time.sleep, status=remote.app_status):
    seen = {app: {"ran": False, "visible": False, "answers": 0} for app in ids}
    deadline = clock() + seconds
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        while clock() < deadline:
            for app, value in zip(ids, pool.map(lambda i: status(host, i), ids), strict=True):
                if value is None:
                    continue
                seen[app]["answers"] += 1
                seen[app]["ran"] = seen[app]["ran"] or value["running"]
                seen[app]["visible"] = seen[app]["visible"] or value["visible"]
                if on_tick and value["visible"]:
                    on_tick(app)
            sleep(POLL_INTERVAL_S)
    return seen


def verdicts(seen, before_running):
    """Classify. An app that was already running (pre-launched) and never became visible
    cannot be told apart from one that was never opened, so it is reported as silent only
    when the user confirms they opened it."""
    result = {}
    for app, s in seen.items():
        if s["visible"]:
            result[app] = "reports-visible"
        elif before_running.get(app):
            result[app] = "silent-or-not-opened"
        elif s["ran"]:
            result[app] = "silent"
        else:
            result[app] = "not-opened"
    return result
