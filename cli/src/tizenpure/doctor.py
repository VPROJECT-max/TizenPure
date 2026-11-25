"""`tizenpure doctor`: the mandatory, strictly read-only first step.

It only performs GET requests on :8001 and these SDB reads:
  capability:          (sdbd feature list)
  shell:0 getduid      (device id, needed for certificates; never printed in full)
  shell:0 vd_applist   (installed apps)
Nothing is written, launched or killed.
"""

import hashlib

from tizenpure import catalog, discover, models, remote
from tizenpure.sdb import SdbError

# Samsung's published web engine per Tizen platform release.
ENGINE_BY_PLATFORM = {5.0: 63, 5.5: 69, 6.0: 76, 6.5: 85, 7.0: 94, 8.0: 108, 9.0: 120, 10.0: 130}


def expected_engine(platform):
    version = models.platform_version(platform)
    known = [p for p in ENGINE_BY_PLATFORM if p <= version]
    return ENGINE_BY_PLATFORM[max(known)] if known else None


def run(host, session_factory):
    """Return a report dict. `session_factory(host)` opens a DeviceSession (or a fake)."""
    report = {"host": host, "checks": [], "verdict": None}

    def check(name, ok, detail=""):
        report["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
        return ok

    device = remote.info(host)
    report["tv"] = {
        "model": device.get("modelName"),
        "model_code": device.get("model"),
        "year": models.year_from_model_code(device.get("model")),
        "power": device.get("PowerState"),
        "frame": device.get("FrameTVSupport") == "true",
        "network": device.get("networkType"),
        "developer_mode": device.get("developerMode") == "1",
        "country": device.get("countryCode"),
    }
    check("TV answers on :8001", True, f"{device.get('modelName')} ({device.get('model')})")
    if not check("Developer Mode is on", device.get("developerMode") == "1"):
        report["verdict"] = "Turn on Developer Mode (Apps > 1 2 3 4 5) with this PC's IP, then restart the TV."
        return report
    own = discover.local_ipv4()
    developer_ip = device.get("developerIP")
    check(
        "Developer Mode Host PC IP is this PC",
        developer_ip in own,
        "matches" if developer_ip in own else "TV expects a different PC address",
    )

    try:
        with session_factory(host) as session:
            caps = session.capability()
            duid = session.duid().strip()
            applist = session.applist()
    except SdbError as error:
        check("SDB connection", False, str(error))
        report["verdict"] = "SDB unreachable. Restart the TV after enabling Developer Mode, then retry."
        return report

    platform = caps.get("platform_version", "")
    report["platform"] = {
        "tizen": platform,
        "arch": caps.get("cpu_arch"),
        "bits": caps.get("architecture"),
        "sdbd": caps.get("sdbd_version"),
        "root": caps.get("sdbd_rootperm"),
        "expected_chromium": expected_engine(platform),
        "sdk_toolpath": caps.get("sdk_toolpath"),
    }
    check("SDB connection", True, caps.get("device_name", ""))
    check(
        f"Tizen {models.MIN_PLATFORM_VERSION}+ (launcher floor)",
        models.platform_version(platform) >= models.MIN_PLATFORM_VERSION,
        f"Tizen {platform}, Chromium ~M{expected_engine(platform)}",
    )
    check("Verb `0 getduid` allowed", bool(duid) and "not" not in duid.lower(), "ok" if duid else "empty reply")
    report["duid_sha256_16"] = hashlib.sha256(duid.encode()).hexdigest()[:16] if duid else None
    apps = catalog.parse_applist(applist)
    check("Verb `0 vd_applist` allowed", bool(apps), f"{len(apps)} apps")
    pkgs = catalog.packages(applist)
    report["apps"] = {cls: sorted(v["name"] for v in pkgs.values() if v["class"] == cls) for cls in catalog.CLASSES}
    report["tizenpure_installed"] = catalog.TIZENPURE_PKG in pkgs
    check("Root is disabled (expected; TizenPure never uses root)", caps.get("sdbd_rootperm") != "enabled")

    tier = models.tier(device.get("modelName"), platform)
    report["tier"] = tier
    report["allowed"] = sorted(models.ALLOWED[tier])
    failed = [c for c in report["checks"] if not c["ok"]]
    if tier == "unsupported":
        report["verdict"] = "Unsupported platform: read-only commands only."
    elif failed:
        report["verdict"] = "Fix the failed checks above before any change."
    elif tier == "verified":
        report["verdict"] = "Verified model. Safe to continue with: certs -> install hello -> install launcher."
    else:
        report["verdict"] = "Unverified model: read-only commands and TizenPure's own app install/uninstall only."
    report["ok"] = not failed
    return report


def render(report):
    lines = []
    tv = report.get("tv", {})
    lines.append(f"TV        {tv.get('model')}  ({tv.get('model_code')}, {tv.get('year') or '?'})")
    if report.get("platform"):
        p = report["platform"]
        lines.append(f"Platform  Tizen {p['tizen']}  {p['arch']}/{p['bits']}-bit  Chromium ~M{p['expected_chromium']}")
    if report.get("duid_sha256_16"):
        lines.append(f"DUID      present (sha256 {report['duid_sha256_16']}...)")
    lines.append("")
    for c in report["checks"]:
        mark = "OK " if c["ok"] else "!! "
        lines.append(f"  {mark} {c['name']}" + (f"  - {c['detail']}" if c["detail"] else ""))
    if report.get("apps"):
        lines.append("")
        for cls in catalog.CLASSES:
            names = report["apps"].get(cls) or []
            lines.append(f"  [{cls}] {len(names)}: " + ", ".join(names[:12]) + (" ..." if len(names) > 12 else ""))
    lines.append("")
    if report.get("tier"):
        lines.append(f"Model tier: {report['tier']}  (allowed: {', '.join(report['allowed'])})")
    lines.append(f"Verdict:   {report['verdict']}")
    return "\n".join(lines)
