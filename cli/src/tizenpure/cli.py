"""tizenpure - a cleaner, faster Samsung Tizen TV, from your PC. Safe by default.

Read-only
  tizenpure discover               find TVs on your network
  tizenpure doctor                 MANDATORY first step: OS, engine, DUID, Developer Mode, verdict
  tizenpure apps [--all]           installed apps, classified (protected/keep/bloat/optional)
  tizenpure watcher probe          which of your apps let the watcher return you to TizenPure
  tizenpure dns export|lint|guide  blocklists for your resolver, and how to set DNS
  tizenpure privacy                the on-TV privacy checklist
  tizenpure recovery               the recovery ladder

PC only
  tizenpure certs                  sign in to YOUR Samsung account; create certs for this TV

App-level (reversible)
  tizenpure install hello          sign + install a hello-world app (proves the path)
  tizenpure install launcher       sign + install TizenPure
  tizenpure uninstall hello|launcher
  tizenpure launch hello|launcher
  tizenpure inspect launcher       open the launcher with Chrome DevTools on localhost:9222
  tizenpure debloat                DRY RUN: what could be removed
  tizenpure debloat --remove PKG[,PKG] --apply   remove user-removable store apps

Every change: preflight (identity + firmware + model tier) -> you confirm -> snapshot ->
change -> read-back verify. Add --tv IP to pick a TV, --yes to skip prompts.
"""

import argparse
import datetime
import json
import sys
import tempfile
import zipfile
from pathlib import Path

from tizenpure import (
    __version__,
    catalog,
    discover,
    dns,
    doctor,
    models,
    package,
    privacy,
    redact,
    remote,
    state,
    watcherprobe,
)
from tizenpure.device import DeviceSession
from tizenpure.sdb import SdbError

LAUNCHER_APP_ID = "TizenPure0.Home"
HELLO_APP_ID = "TizenPureH.Hello"
OWN_APPS = {"launcher": LAUNCHER_APP_ID, "hello": HELLO_APP_ID}
INSPECT_PORT = 9222
INSPECT_TIMEOUT_S = 60
REPO_ROOT = Path(__file__).resolve().parents[3]
BUNDLED_LAUNCHER = Path(__file__).with_name("data") / "launcher"

RECOVERY = """Recovery ladder (stop at the first step that works):
  1. Back / Exit on the remote.
  2. Press Home on the remote: Samsung Home always opens (apps cannot capture Home).
     Press Home again within 30 s of TizenPure reappearing and the watcher stands
     aside for 10 minutes.
  3. Hold Power until the TV restarts (cold boot).
  4. Delete TizenPure on the TV: Apps > Settings (gear) > TizenPure > Delete.
  5. From the PC: tizenpure uninstall launcher
  6. Settings > Support > Device Care > Self Diagnosis > Reset Smart Hub.
  7. Factory reset (last resort).
Never use the service menu or a USB reflash unless Samsung support tells you to.
The watcher also disables itself after repeated failed launcher starts, so a broken
launcher cannot trap you."""


class Abort(SystemExit):
    pass


def say(*parts):
    print(*parts, flush=True)


def confirm(question, args):
    if getattr(args, "yes", False):
        return True
    if not sys.stdin.isatty():
        raise Abort(f"{question} - needs confirmation; re-run with --yes to proceed non-interactively.")
    return input(f"{question} [y/N] ").strip().lower() in ("y", "yes")


def pick_tv(args):
    if args.tv:
        return args.tv
    tvs = discover.discover()
    if not tvs:
        raise Abort("No Samsung TV found. Is it on and on the same network? Or pass --tv <ip>.")
    if len(tvs) > 1:
        listing = "\n".join(f"  {t['ip']}  {t['model']}  ({t['name']})" for t in tvs)
        raise Abort(f"Several TVs found; choose one with --tv:\n{listing}")
    return tvs[0]["ip"]


def session(host):
    return DeviceSession(host)


def snapshot(host_key, text):
    folder = state.private_dir("snapshots")
    path = folder / f"{host_key}-applist-{datetime.datetime.now():%Y%m%d-%H%M%S}.txt"
    path.write_text(text, encoding="utf-8")
    return path


def preflight(args, action):
    """Identity + firmware + model tier, then explicit confirmation. Returns (host, device)."""
    host = pick_tv(args)
    device = remote.info(host)
    model = device.get("modelName")
    if device.get("developerMode") != "1":
        raise Abort("Developer Mode is off. Turn it on with this PC's IP and restart the TV.")
    with session(host) as s:
        platform = s.capability().get("platform_version", "")
    tier = models.tier(model, platform)
    say(f"TV: {model} ({device.get('model')}), Tizen {platform}, tier: {tier}")
    if not models.allows(model, action, platform):
        raise Abort(f"Refusing: '{action}' changes are not allowed on {tier} models. See docs/compatibility.md.")
    if not confirm(f"Is this your TV ({model}) and do you want to continue?", args):
        raise Abort("Cancelled.")
    return host, device


# -- read-only -------------------------------------------------------------


def cmd_discover(args):
    tvs = discover.discover(sweep=not args.no_sweep)
    if args.json:
        say(json.dumps(tvs, indent=2))
        return
    if not tvs:
        say("No Samsung TV found.")
        return
    for tv in tvs:
        dev = "on" if tv["developerMode"] == "1" else "off"
        say(f"{tv['ip']:<16} {tv['model']:<18} {tv['model_code'] or '':<16} power={tv['power']} developer-mode={dev}")
    say("\nNext: tizenpure doctor" + (f" --tv {tvs[0]['ip']}" if len(tvs) > 1 else ""))


def cmd_doctor(args):
    host = pick_tv(args)
    report = doctor.run(host, session)
    if args.json:
        say(json.dumps(redact.mapping(report) if args.redact else report, indent=2))
    else:
        say(doctor.render(report))
    if not report.get("ok"):
        raise SystemExit(1)


def cmd_apps(args):
    host = pick_tv(args)
    with session(host) as s:
        text = s.applist()
    pkgs = catalog.packages(text)
    if args.json:
        rows = [
            {"package": p, "name": v["name"], "class": v["class"], "apps": [a["appid"] for a in v["apps"]]}
            for p, v in sorted(pkgs.items(), key=lambda kv: kv[1]["name"].lower())
        ]
        say(json.dumps(rows, indent=2))
        return
    guide = catalog.guide()
    for cls in catalog.CLASSES:
        group = sorted(((p, v) for p, v in pkgs.items() if v["class"] == cls), key=lambda kv: kv[1]["name"].lower())
        if args.explain:
            say(f"[{cls}] {len(group)}")
            for _pkgid, v in group:
                info = next((guide[a["appid"]] for a in v["apps"] if a["appid"] in guide), None)
                what = info["what"] if info else "No description yet."
                note = f" ({info['action']}{': ' + info['note'] if info.get('note') else ''})" if info else ""
                say(f"   {v['name']:<30} {what}{note}")
            continue
        if cls == "protected" and not args.all:
            say(f"[protected] {len(group)} platform packages hidden (use --all)")
            continue
        say(f"[{cls}] {len(group)}")
        for pkgid, v in group:
            say(f"   {v['name']:<36} {pkgid}")


def cmd_watcher_probe(args):
    host = pick_tv(args)
    with session(host) as s:
        ids = watcherprobe.store_ids(s.applist())
    before = {i: bool((remote.app_status(host, i) or {}).get("running")) for i in ids}
    say(
        f"Probing {len(ids)} apps for {args.seconds} s (read-only).\n"
        "Now, on the TV: open each streaming app you use, play a few seconds, press Home.\n"
    )
    shown = set()

    def tick(app):
        if app not in shown:
            shown.add(app)
            say(f"  visible: {ids[app]}")

    seen = watcherprobe.probe(host, list(ids), args.seconds, on_tick=tick)
    result = watcherprobe.verdicts(seen, before)
    say("")
    for app, verdict in sorted(result.items(), key=lambda kv: (kv[1], ids[kv[0]].lower())):
        if verdict != "not-opened" or args.all:
            say(f"  {verdict:<22} {ids[app]}")
    path = state.private_dir("logs") / f"watcher-probe-{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps({ids[k]: v for k, v in result.items()}, indent=2), encoding="utf-8")
    say(
        "\nreports-visible: Home returns to TizenPure.  silent: the watcher stands aside while it\n"
        "runs, so playback is never interrupted (use Back, or the TizenPure row, to return).\n"
        f"Saved: {path}"
    )


def cmd_dns(args):
    if args.dns_command == "lint":
        problems = dns.lint()
        for p in problems:
            say("!!", p)
        if problems:
            raise SystemExit(1)
        say("DNS lists OK: valid, no duplicates, nothing on the allowlist is blocked.")
    elif args.dns_command == "export":
        text = dns.export(args.tier, args.format, hagezi=args.hagezi)
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
            say(f"Wrote {len(text.splitlines())} entries to {args.output}")
        else:
            sys.stdout.write(text)
    else:
        say(dns.guide())


def cmd_autostart(args):
    from tizenpure import autostart

    if args.autostart_command == "run":
        host = pick_tv(args)
        log = say
        if args.log:
            path = state.private_dir("logs") / "autostart.log"

            def log(message):
                with open(path, "a", encoding="utf-8") as handle:
                    handle.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {message}\n")

        autostart.run(host, log=log)
        return
    if args.autostart_command == "test":
        host = pick_tv(args)
        say("Opening TizenPure through the TV's local API:", "accepted" if autostart.launch(host) else "refused")
        return
    if sys.platform != "win32":
        raise Abort("install/uninstall is for Windows. Elsewhere run `tizenpure autostart run` from your init system.")
    target = autostart.startup_dir() / autostart.STARTUP_NAME
    if args.autostart_command == "status":
        say(f"Installed: {target}" if target.exists() else "Not installed.")
        return
    if args.autostart_command == "uninstall":
        if target.exists():
            target.unlink()
        say("Removed. TizenPure will no longer be opened by this PC at power-on.")
        return
    host = pick_tv(args)
    argv = autostart.command_line(host)
    say("This adds a small script to your Windows Startup folder that runs, hidden:")
    say("   " + " ".join(argv))
    say(f"   -> {target}")
    say("It only reads the TV's power state and opens TizenPure after the TV powers on.")
    if not confirm("Install it?", args):
        raise Abort("Cancelled.")
    target.write_text(autostart.vbs_script(argv), encoding="utf-8")
    say("Installed. It starts at your next sign-in; run `tizenpure autostart run` to start it now.")


def cmd_privacy(_args):
    say(privacy.render())


def cmd_recovery(_args):
    say(RECOVERY)


# -- PC only ---------------------------------------------------------------


def cmd_certs(args):
    from tizenpure import certs

    host = pick_tv(args)
    with session(host) as s:
        duid = s.duid().strip()
    if not duid:
        raise Abort("The TV did not report its DUID.")
    out = state.cert_dir(duid)
    if certs.has_profile(out) and not args.force:
        say(f"Certificates for this TV already exist in {out} (use --force to recreate).")
        return
    say(
        "This opens Samsung's sign-in page in YOUR browser. Sign in to your own Samsung account.\n"
        "TizenPure then asks Samsung's developer CA for an author + distributor certificate bound\n"
        "to this TV. Only Samsung is contacted. Files stay in your private folder:\n"
        f"  {out}"
    )
    if not confirm("Continue?", args):
        raise Abort("Cancelled.")
    certs.create_profile(duid, str(out))
    say(f"Certificates saved to {out}")


def _cert_dir_for(s):
    from tizenpure import certs

    out = state.cert_dir(s.duid().strip())
    if not certs.has_profile(out):
        raise Abort("No certificates for this TV yet. Run: tizenpure certs")
    return out


# -- app level -------------------------------------------------------------


def launcher_source(args):
    if args.wgt:
        return Path(args.wgt)
    for candidate in (REPO_ROOT / "dist" / "launcher", BUNDLED_LAUNCHER):
        if (candidate / "config.xml").exists():
            return candidate
    raise Abort("No built launcher found. Run `npm run build` in the repo, or pass --wgt PATH.")


def source_for(target, args):
    if target == "hello":
        return package.HELLO_DIR
    if target == "launcher":
        return launcher_source(args)
    return Path(target)


def cmd_build(args):
    src = launcher_source(args)
    app_id, _pkg, version = package.metadata(src)
    out = Path(args.output or f"TizenPure-{version}.wgt")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(p for p in Path(src).rglob("*") if p.is_file()):
            archive.write(path, path.relative_to(src).as_posix())
    say(f"Built unsigned {out} ({app_id} {version}). `tizenpure install` signs it for your TV.")


def cmd_install(args):
    src = source_for(args.target, args)
    app_id, package_id, version = package.metadata(src)
    if package_id not in catalog.OWN_PACKAGES and not args.any_app:
        raise Abort("TizenPure installs its own apps. Pass --any-app to sign and install another app you trust.")
    host, _device = preflight(args, models.APP_LEVEL)
    with session(host) as s, tempfile.TemporaryDirectory(prefix="tizenpure-") as work:
        before = s.applist()
        say("snapshot:", snapshot(state.tv_key(host), before))
        output, installed = package.install(s, src, _cert_dir_for(s), work)
        say(output.strip())
        say(f"\nInstalled and verified: {installed['name']} ({app_id} {installed.get('version') or version})")
    if app_id == LAUNCHER_APP_ID:
        say("Open it from Apps on the TV. Undo any time: tizenpure uninstall launcher")


def cmd_uninstall(args):
    app_id = OWN_APPS.get(args.target)
    if not app_id:
        raise Abort("Choose: hello or launcher. (Store apps: tizenpure debloat.)")
    host, _device = preflight(args, models.APP_LEVEL)
    with session(host) as s:
        say("snapshot:", snapshot(state.tv_key(host), s.applist()))
        if not any(a["appid"] == app_id for a in catalog.parse_applist(s.applist())):
            say(f"{app_id} is not installed.")
            return
        package.uninstall(s, app_id)
    say(f"Removed and verified: {app_id}")


def cmd_launch(args):
    app_id = OWN_APPS.get(args.target, args.target)
    host = pick_tv(args)
    with session(host) as s:
        say(s.launch(app_id).strip() or f"Asked the TV to open {app_id}.")


def cmd_inspect(args):
    app_id = OWN_APPS.get(args.target, args.target)
    host = pick_tv(args)
    # A debug launch can take 20+ s when the app is already running; restart it cleanly.
    with DeviceSession(host, timeout=INSPECT_TIMEOUT_S) as s:
        s.shell(f"0 was_kill {app_id}")
        port = s.debug_launch(app_id)
        say(f"Inspector on TV port {port}. Open chrome://inspect, add localhost:{args.port}. Ctrl+C to stop.")
        s.forward(args.port, port)


def cmd_debloat(args):
    host = pick_tv(args)
    with session(host) as s:
        text = s.applist()
    pkgs = catalog.packages(text)
    if not args.remove:
        say("DRY RUN - nothing is removed.\n")
        for cls in ("bloat", "optional", "keep"):
            group = sorted((v["name"], p) for p, v in pkgs.items() if v["class"] == cls)
            note = {"bloat": "suggested", "optional": "only if you name it", "keep": "streaming/services: kept"}[cls]
            say(f"[{cls}] ({note})")
            for name, pkgid in group:
                say(f"   {name:<36} {pkgid}")
        say("\nRemove with: tizenpure debloat --remove PKGID[,PKGID] --apply")
        say("Removed store apps can be reinstalled from the Samsung store. Preinstalled apps cannot be")
        say("removed over Developer Mode; delete or disable them on the TV (Apps > Settings).")
        return
    chosen = [p.strip() for p in args.remove.split(",") if p.strip()]
    for pkgid in chosen:
        if pkgid not in pkgs:
            raise Abort(f"{pkgid} is not installed.")
        cls = pkgs[pkgid]["class"]
        if cls == "protected":
            raise Abort(f"{pkgs[pkgid]['name']} ({pkgid}) is protected; refusing.")
        if cls == "keep" and not args.allow_keep:
            raise Abort(
                f"{pkgs[pkgid]['name']} is a streaming/service app TizenPure keeps. Add --allow-keep if you really mean it."
            )
    say("Will remove:\n" + "\n".join(f"   {pkgs[p]['name']:<36} {p}" for p in chosen))
    if not args.apply:
        say("\nDRY RUN. Add --apply to remove.")
        return
    host, _device = preflight(args, models.STORE_APPS)
    refused = []
    with session(host) as s:
        say("snapshot:", snapshot(state.tv_key(host), s.applist()))
        for pkgid in chosen:
            out = s.uninstall(pkgs[pkgid]["apps"][0]["appid"]).strip()
            gone = pkgid not in catalog.packages(s.applist())
            say(f"{'removed' if gone else 'still present'}: {pkgs[pkgid]['name']}")
            if not gone:
                refused.append(pkgs[pkgid]["name"])
                say("   TV said:", out[-160:] or "(nothing)")
    if refused:
        say("\nThis firmware (Tizen 6+) refuses to remove store apps over Developer Mode; only apps")
        say("installed from this PC can be removed that way. Delete these on the TV instead:")
        say("   Home > Apps > Settings (gear) > select the app > Delete\n   " + ", ".join(refused))


# -- entry -----------------------------------------------------------------


def parser():
    p = argparse.ArgumentParser(
        prog="tizenpure", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--version", action="version", version=f"tizenpure {__version__}")
    p.add_argument("--tv", help="TV IP address (default: discover)")
    p.add_argument("--yes", "-y", action="store_true", help="answer yes to confirmations")
    sub = p.add_subparsers(dest="command", required=True)

    d = sub.add_parser("discover")
    d.add_argument("--json", action="store_true")
    d.add_argument("--no-sweep", action="store_true", help="SSDP only; no /24 port check")
    d.set_defaults(func=cmd_discover)

    for name in ("doctor", "status"):
        x = sub.add_parser(name)
        x.add_argument("--json", action="store_true")
        x.add_argument("--redact", action="store_true", help="remove identifiers from JSON output")
        x.set_defaults(func=cmd_doctor)

    a = sub.add_parser("apps")
    a.add_argument("--all", action="store_true")
    a.add_argument("--json", action="store_true")
    a.add_argument("--explain", action="store_true", help="what each app is and what you can safely do")
    a.set_defaults(func=cmd_apps)

    w = sub.add_parser("watcher")
    wsub = w.add_subparsers(dest="watcher_command", required=True)
    wp = wsub.add_parser("probe")
    wp.add_argument("--seconds", type=int, default=120)
    wp.add_argument("--all", action="store_true")
    wp.set_defaults(func=cmd_watcher_probe)

    n = sub.add_parser("dns")
    nsub = n.add_subparsers(dest="dns_command", required=True)
    nsub.add_parser("lint").set_defaults(func=cmd_dns)
    nsub.add_parser("guide").set_defaults(func=cmd_dns)
    ne = nsub.add_parser("export")
    ne.add_argument("--tier", choices=sorted(dns.TIERS), default="safe")
    ne.add_argument("--format", choices=dns.FORMATS, default="plain")
    ne.add_argument("--hagezi", action="store_true", help="also fetch HaGeZi's Samsung list (GPL-3.0) at run time")
    ne.add_argument("--output", "-o")
    ne.set_defaults(func=cmd_dns)

    au = sub.add_parser("autostart", help="open TizenPure when the TV powers on (runs on this PC)")
    ausub = au.add_subparsers(dest="autostart_command", required=True)
    ar = ausub.add_parser("run")
    ar.add_argument("--log", action="store_true", help="log to the private logs folder instead of the console")
    for name in ("install", "uninstall", "status", "test"):
        ausub.add_parser(name)
    for parser_ in ausub.choices.values():
        parser_.set_defaults(func=cmd_autostart)

    sub.add_parser("privacy").set_defaults(func=cmd_privacy)
    sub.add_parser("recovery").set_defaults(func=cmd_recovery)

    c = sub.add_parser("certs")
    c.add_argument("--force", action="store_true")
    c.set_defaults(func=cmd_certs)

    b = sub.add_parser("build")
    b.add_argument("--wgt", help=argparse.SUPPRESS)
    b.add_argument("--output", "-o")
    b.set_defaults(func=cmd_build)

    i = sub.add_parser("install")
    i.add_argument("target", help="hello | launcher | PATH")
    i.add_argument("--wgt", help="use this launcher .wgt instead of the built one")
    i.add_argument("--any-app", action="store_true", help=argparse.SUPPRESS)
    i.set_defaults(func=cmd_install)

    u = sub.add_parser("uninstall")
    u.add_argument("target", choices=sorted(OWN_APPS))
    u.set_defaults(func=cmd_uninstall)

    l_ = sub.add_parser("launch")
    l_.add_argument("target")
    l_.set_defaults(func=cmd_launch)

    ins = sub.add_parser("inspect")
    ins.add_argument("target")
    ins.add_argument("--port", type=int, default=INSPECT_PORT)
    ins.set_defaults(func=cmd_inspect)

    db = sub.add_parser("debloat")
    db.add_argument("--remove", help="comma-separated package ids")
    db.add_argument("--apply", action="store_true", help="actually remove (default is a dry run)")
    db.add_argument("--allow-keep", action="store_true", help="permit removing a streaming/service app")
    db.set_defaults(func=cmd_debloat)
    return p


def hoist_global_options(argv):
    """Accept --yes/-y and --tv IP anywhere on the command line, not only before the command."""
    rest, front = [], []
    i = 0
    while i < len(argv):
        if argv[i] in ("--yes", "-y"):
            front.append(argv[i])
        elif argv[i] == "--tv" and i + 1 < len(argv):
            front += argv[i : i + 2]
            i += 1
        else:
            rest.append(argv[i])
        i += 1
    return front + rest


def main(argv=None):
    args = parser().parse_args(hoist_global_options(list(sys.argv[1:] if argv is None else argv)))
    try:
        args.func(args)
    except remote.TvUnreachable as error:
        raise SystemExit(str(error)) from None
    except SdbError as error:
        raise SystemExit(f"sdb: {error}") from None
    except ValueError as error:
        raise SystemExit(f"Error: {error}") from None
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
