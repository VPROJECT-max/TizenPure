# TizenPure

A cleaner, faster, iOS-inspired home screen for Samsung Tizen TVs, installed from your
Windows PC. Free, open source (MIT), no root, and every change is reversible.

- **Launcher**: a paged squircle app grid with a dock, folders and an edit mode, a Control
  Center for inputs and settings, themes, accents, wallpapers, icon sizes, grid density,
  clock styles and five languages. It makes no internet requests at all.
- **Watcher**: a small background service that brings TizenPure back when Samsung Home
  covers it, and steps aside for everything else (apps, casts, HDMI, Live TV).
- **CLI** (`tizenpure`): finds your TV, checks it read-only, signs and installs the launcher
  with your own Samsung developer certificate, lists and (only on request) removes
  user-removable store apps, and exports DNS blocklists.

What it deliberately does **not** do: root, firmware changes, service-menu changes, or
uninstalling preinstalled apps (Tizen 6+ refuses that over Developer Mode anyway).

## Safety first

TizenPure is built so it cannot trap you or break the TV:

- `tizenpure doctor` is read-only and is always the first step. Unverified models only get
  read-only commands plus installing/uninstalling TizenPure itself.
- Every change runs **preflight → your confirmation → snapshot → change → read-back check**.
- The physical **Home** button always reaches Samsung Home. Press it **twice** and the watcher
  stays out of the way until you open TizenPure again.
- The watcher **turns itself off** after repeated failed starts, never acts while the TV is in
  standby, and never interrupts an app that is on screen or that it cannot see.
- Streaming apps (Netflix, YouTube, Prime Video, Disney+, HBO Max, TV Plus, ...) and Samsung
  account / SmartThings / firmware updates are on a keep list: `debloat` refuses them and the
  DNS lists are checked against an allowlist in CI.

**Recovery ladder**: Back → Home (press twice) → hold Power to restart → delete TizenPure in
*Apps → Settings* → `tizenpure uninstall launcher` → Reset Smart Hub. Details:
[docs/safety.md](docs/safety.md).

## Quick start (Windows)

1. On the TV: open **Apps**, press **1 2 3 4 5** on the remote, turn **Developer Mode** on, enter
   your PC's IP address, then restart the TV (hold Power until it reboots).
2. On the PC, download `tizenpure.exe` from the latest release (no Python, Java or Tizen
   Studio needed), then:

```powershell
.\tizenpure.exe discover
```

```powershell
.\tizenpure.exe doctor
```

```powershell
.\tizenpure.exe certs
```

```powershell
.\tizenpure.exe install hello
```

```powershell
.\tizenpure.exe install launcher
```

`certs` opens Samsung's sign-in page in your browser; you sign in to **your own** Samsung
account and Samsung issues a certificate for **your** TV. Only Samsung is contacted
([docs/certificates.md](docs/certificates.md)). `install hello` installs a tiny test app first,
proving the whole signing path before the real launcher goes on; remove it with
`tizenpure uninstall hello`.

3. Make TizenPure open at power-on: set *Start Screen Options* on the TV, and if your PC is
   usually on, `tizenpure autostart install` ([why](docs/compatibility.md#opening-tizenpure-at-power-on)).
4. Optional: [watcher check](docs/compatibility.md#watcher-check), [DNS blocking and the
   privacy checklist](docs/privacy.md), and `tizenpure debloat` (a dry run unless you add
   `--apply`).
5. When you're done, turn Developer Mode **off** again ([why](docs/safety.md#developer-mode)).

## Using the launcher

| Remote | Action |
|---|---|
| Arrows / OK | Move / open |
| Hold OK (or Tools) | App actions: move, dock, folder, hide, edit home |
| Up from the top row, or Red/Yellow | Control Center: inputs, Samsung Home, TV settings, theme |
| Blue or Info | TizenPure settings |
| Back | Leave edit mode, or jump to the first page |

## Documentation

- [Install and update](docs/install.md)
- [Certificates](docs/certificates.md)
- [Safety, watcher rules and recovery](docs/safety.md)
- [Privacy: DNS and Samsung settings](docs/privacy.md)
- [Debloat: what is possible on Tizen 9](docs/debloat.md)
- [Making the TV faster](docs/performance.md)
- [Compatibility and on-TV acceptance](docs/compatibility.md)
- [Development](docs/development.md)

## Credits

Built on the shoulders of [AeroTizen](https://github.com/helalaou/AeroTizen) (MIT), which
credits tizen-sdb and Apps2Samsung; Glass Home and its port of
[Arn0](https://github.com/NelsonEU/arn0-tv)'s HDMI switching; Free My TV's system-app filter;
and [Lucide](https://lucide.dev) icons (ISC). See [NOTICE](NOTICE) and
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Samsung and Tizen are trademarks of Samsung Electronics. TizenPure is not affiliated with
Samsung.
