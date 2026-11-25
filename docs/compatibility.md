# Compatibility and on-TV acceptance

The launcher targets **Chromium 63** (Tizen 5.0, 2019) and is tested against newer engines;
the watcher is plain ES5. CI enforces both (`npm run compat`).

## Model tiers

| Tier | Allowed |
|---|---|
| verified | everything (each change still needs preflight + confirmation) |
| unverified | read-only commands, install/uninstall TizenPure itself |
| unsupported (Tizen < 5) | read-only commands |

Verified models live in `cli/src/tizenpure/models.py`. To add yours, run the acceptance
sequence below and open a pull request with the results (`tizenpure doctor --json --redact`).

| Model | Year | Tizen | doctor | sign/install | launcher | watcher | notes |
|---|---|---|---|---|---|---|---|
| UE55CU7172UXXH (Crystal UHD CU7172 55") | 2023 | 9.0 (armv7, Chromium 120.0.6099) | ✅ | ✅ | ✅ | ✅ | Home returns in ~3 s; double-Home escape, Netflix and YouTube report visibility and are never interrupted. Cold boot: needs Autorun Last App or `tizenpure autostart` (see below); Developer Mode off: pending |
| UE65CU7172UXXH (65") | 2023 | 9.0 | - | - | - | - | launcher attested by AeroTizen's table |

## Acceptance sequence

Read-only first; stop at the first failure.

1. `tizenpure doctor` - all checks OK. **Abort all writes if the model is not verified**
   (unverified models may still install TizenPure itself).
2. `tizenpure certs`, `tizenpure install hello`, open it, `tizenpure uninstall hello`.
3. `tizenpure install launcher`; check grid, navigation, app launch, HDMI from the Control
   Center, and that "Glass effects" shows a sensible automatic tier.
4. Watcher: press Home on TizenPure (it comes back); press Home twice (Samsung Home stays);
   open Netflix from TizenPure and press Home (returns); run the [watcher check](#watcher-check);
   restart the TV with Power and check TizenPure opens.
5. DNS + privacy checklist; confirm account, SmartThings, TV Plus, the store and a firmware
   update check still work.
6. Developer Mode off, restart, TizenPure still opens.

## Results on UE55CU7172UXXH (Tizen 9.0)

- Signing: Samsung certificate, hello-world install, launch (`visible: true` via the local API)
  and uninstall all verified by read-back.
- Launcher: full-glass tier chosen automatically, artwork from the TV's icon cache, no console
  errors, Romanian locale picked up from the TV.
- Watcher (real Home key over the TV's remote channel): Home on TizenPure → back in ~3 s;
  Home again within 30 s → Samsung Home stays; Netflix and YouTube opened from outside TizenPure
  report `visible` and are followed, never interrupted; Home inside Netflix → back in ~2.5 s.
- Samsung Home (`com.samsung.tv.csfs`) cannot be opened over SDB (`launch failed[400]`), so
  the Control Center's "Samsung Home" tile relies on the app-level launch from the TV itself.

## Opening TizenPure at power-on

A background service signed with a free Samsung certificate is **not started at boot** on
retail TVs (Samsung reserves that for partner-signed apps; prelaunch has been unsupported
since 2019). Verified on the CU7172: after a power cut the TV opened Live TV and TizenPure's
watcher was not running until TizenPure was opened. Two layers fix it:

1. **On the TV**: Start Screen Options → Start with Smart Hub Home **Off**, Autorun Last App
   **On**, Autorun Samsung TV Plus **Off**. This reopens TizenPure on power-on from standby
   when it was the last app used.
2. **From an always-on PC** (covers power cuts): `tizenpure autostart install` adds a hidden
   helper to your Windows Startup folder. When the TV powers on it opens TizenPure through
   the TV's local API (no Developer Mode), never over an app that is already on screen.
   `tizenpure autostart uninstall` removes it. Only one helper runs at a time; its log is
   `%APPDATA%\TizenPure\logsutostart.log`. It uses the TV address you installed it with,
   so give the TV a fixed address (DHCP reservation) in your router.

Updating TizenPure: the TV keeps a running watcher alive across reinstalls. From 0.1.1
the launcher detects an outdated watcher and restarts it; older builds need one TV restart.

## Watcher check

```powershell
.\tizenpure.exe watcher probe --seconds 120
```

While it runs (read-only), open each streaming app you use, play a few seconds, and press
Home. Apps reported `reports-visible` return you to TizenPure when you press Home in them;
`silent` apps are never interrupted, and Home in them shows Samsung Home.
