# Changelog

## 0.1.1

- Power-on: `tizenpure autostart` opens TizenPure when the TV powers on (covers power cuts,
  where Samsung never starts a free-certificate service); Start Screen Options guide.
- Watcher only opens TizenPure by itself in the first 5 minutes after the TV starts, and
  restarts itself after an update (the TV kept old watchers alive across reinstalls).
- `tizenpure apps --explain`; debloat explains that Tizen 6+ refuses removal over Developer
  Mode; new docs: debloat.md and performance.md (measured on a 2023 CU7172, Tizen 9).
- Launcher: hides placeholder app entries (e.g. a duplicate Apple Music); About shows the
  real web engine on Tizen 9.
- DNS: block rtb.adgrx.com; keep Samsung store/setup (osb-*) and account hosts allowed.

## 0.1.0

- First release: launcher (grid, dock, folders, edit mode, Control Center, settings, themes,
  wallpapers, performance tiers, five languages), safe watcher with crash-loop protection,
  and the `tizenpure` CLI (discover, doctor, certs, install, uninstall, apps, debloat dry-run,
  DNS lists, privacy checklist, watcher probe).
