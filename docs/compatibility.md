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
| UE55CU7172UXXH (Crystal UHD CU7172 55") | 2023 | 9.0 (armv7, ~M120) | ✅ | pending | pending | pending | read-only doctor passed |
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

## Watcher check

```powershell
.\tizenpure.exe watcher probe --seconds 120
```

While it runs (read-only), open each streaming app you use, play a few seconds, and press
Home. Apps reported `reports-visible` return you to TizenPure when you press Home in them;
`silent` apps are never interrupted, and Home in them shows Samsung Home.
