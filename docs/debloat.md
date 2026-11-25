# What can be debloated on a 2023 Tizen 9 TV (measured)

Findings from a UE55CU7172UXXH on Tizen 9.0, collected read-only with `tizenpure doctor`,
`tizenpure apps --explain` and the launcher's own `tizen.application` APIs.

## What is on the TV

- **496** application entries, of which **25** are apps you see. The other 471 are system
  components (Smart Hub, voice, SmartThings, players, input, accessibility, diagnostics).
- About **54** run at any time after boot, including Samsung's
  `targeted-ad-service`, about nine Bixby/voice processes, Multi Control, a Galaxy Buds
  scanner, Samsung Health, SmartThings Find, Home recommendation providers, and Netflix,
  Prime Video, YouTube (Cobalt) and the browser, which Samsung preloads.
- 1.65 GB RAM, about 600 MB free after boot.

`tizenpure apps --explain` prints what each user-facing app is and what you can safely do.

## What works, and what does not

| Approach | Result on Tizen 9 | Notes |
|---|---|---|
| Remove store or preinstalled apps over Developer Mode (`0 vd_appuninstall`) | refused: `can not uninstall app` | Only apps installed from your PC can be removed this way. |
| Delete apps on the TV (Apps → Settings → app → Delete) | works for store apps | Preinstalled system apps (Apps store, Gaming Hub, Windows 365, e-Manual) can only be hidden. |
| Stop a background service for the session (`0 was_kill`, `0 kill`) | `was_kill` refused for system apps; `kill` reports success but the service restarts within ~20 s | Not useful, so TizenPure does not offer it. |
| Samsung's Privacy Choices (ACR, interest-based ads, recommendations) | works, reversible | Stops the data being used and sent even though the services stay resident. |
| DNS blocking (`dns/samsung-ads.txt`) | works at the network level | The ad and ACR services keep running but cannot reach their servers. |
| Voice wake-up and Bixby off | works, reversible | Reduces voice activity; the mic button keeps working. |
| Hide system apps from TizenPure | works | TizenPure Settings → Hidden apps to undo. |
| Root, firmware or service-menu changes | **never** | Risk of bricking; out of scope by design. |

## Recommended order

1. `tizenpure apps --explain`, then delete unwanted store apps on the TV.
2. Run the [privacy checklist](privacy.md#samsung-settings-checklist).
3. Load the safe DNS list on your router, or set AdGuard DNS on the TV.
4. Voice: Settings → General & Privacy → Voice → Voice Wake-up off (if you don't say "Hi Bixby").
5. For speed, see [performance.md](performance.md).
