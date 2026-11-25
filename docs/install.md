# Install and update

## Requirements

- A Samsung TV with Tizen 5.0 or later (2019+). Run `tizenpure doctor` to check yours.
- A Windows PC on the same network (macOS/Linux work with `pip install ./cli`).
- A free Samsung account (for the developer certificate).

## Steps

1. **Developer Mode** on the TV: Apps → press `1 2 3 4 5` → Developer Mode **On** → enter
   this PC's IPv4 address (`ipconfig` shows it) → OK → restart the TV by holding Power.
2. `tizenpure discover` lists TVs it finds (SSDP, then a read-only check of port 8001 on your
   local /24 network). With several TVs, add `--tv TV_IP` to every command.
3. `tizenpure doctor` - read-only. It confirms Tizen version, web engine, Developer Mode,
   SDB access and your model's tier. Stop here if it reports a failed check.
4. `tizenpure certs` - see [certificates](certificates.md).
5. `tizenpure install hello`, open *TizenPure Hello* on the TV, then
   `tizenpure uninstall hello`. This proves signing, install and removal.
6. `tizenpure install launcher`, then open **TizenPure** from Apps once. The watcher starts
   with it, and from then on at every boot.
7. Turn Developer Mode off when you're done.

## Update

Build or download the new version, then run `tizenpure install launcher` again: the TV
replaces the app in place and keeps your layout and settings. Major Samsung OS updates
remove sideloaded apps: run `tizenpure install launcher` again (it re-signs the package).
If the TV then reports a certificate error, run `tizenpure certs --force` first.

## Uninstall

`tizenpure uninstall launcher`, or on the TV: Apps → Settings → TizenPure → Delete.
Your PC-side files live in `%APPDATA%\TizenPure`; delete that folder to remove them.
