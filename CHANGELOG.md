# Changelog

## [0.2.0](https://github.com/VPROJECT-max/TizenPure/compare/tizenpure-v0.1.1...tizenpure-v0.2.0) (2026-11-25)


### Features

* power-on autostart, watcher self-update, measured debloat and performance guides ([0362344](https://github.com/VPROJECT-max/TizenPure/commit/03623440867418253775824178dc7ce5d3124916))
* TizenPure v0.1.0 launcher, safe watcher and Windows-first CLI ([7ed532c](https://github.com/VPROJECT-max/TizenPure/commit/7ed532c315df259687fbe153bf18fb13e474f4c5))


### Bug Fixes

* **autostart:** single instance, log why a hidden helper stops ([97dc155](https://github.com/VPROJECT-max/TizenPure/commit/97dc1557e10cae5d5fec2caa5bf41aa70f946030))
* **launcher:** hide placeholder app entries; read engine from Tizen 9 UA ([198459b](https://github.com/VPROJECT-max/TizenPure/commit/198459b3ce013e37c877f2e502ba9d7a8b4f5643))
* **watcher:** no wildcard CORS; settings changes need TizenPure on screen ([97580c8](https://github.com/VPROJECT-max/TizenPure/commit/97580c843d0dffcbedf6d68bf0741ddbfeadd2e4))

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
