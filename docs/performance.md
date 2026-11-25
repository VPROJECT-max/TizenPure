# Making the TV faster (what actually helps on Tizen 9)

Measured on a UE55CU7172UXXH: 1.65 GB RAM, about 600 MB free after boot, about 54 processes
running. Samsung's own services restart themselves when stopped, so the gains come from
fewer things being *started*, fewer network calls, and a light home screen.

| Change | Effect | How |
|---|---|---|
| Use TizenPure instead of Samsung Home | Samsung Home's recommendation rows, ads and tiles are not drawn at every Home press | already done |
| Delete apps you don't use | less storage, fewer update checks, fewer background starts | Apps → ⚙ Settings → app → Delete |
| Voice Wake-up off | the always-listening Bixby wake-word engine idles | Settings → All Settings → General & Privacy → Voice → Bixby Settings → Voice Wake-up off (mic button still works) |
| Privacy Choices off (ACR, interest-based ads, customisation) | the ACR and ad services stop collecting and uploading | see [privacy.md](privacy.md) |
| DNS blocking (safe list) | ad, ACR and telemetry requests fail fast instead of transferring data | see [privacy.md](privacy.md#dns) |
| Device Care → Start Device Care | Samsung's supported way to free memory and close background apps | Settings → Support → Device Care → Start Device Care (may need Live TV on screen) |
| Start Screen Options | the TV doesn't load Smart Hub Home or TV Plus at power-on | Settings → All Settings → General & Privacy (Tizen 9: Advanced Features) → Start Screen Options: Start with Smart Hub Home **Off**, Autorun Last App **On**, Autorun Samsung TV Plus **Off** |
| Remote Management off | one less remote-support agent | Settings → Support → Remote Management |
| Glass effects | TizenPure picks full, reduced or flat by measuring your GPU at start; choose *Flat (fastest)* in TizenPure Settings if you prefer | TizenPure → Settings → Glass effects |
| Game Mode (consoles/PC on HDMI) | lower input lag on that input (does not speed up menus) | Settings → Connection → Game Mode Settings |

What does not help, and why TizenPure doesn't do it: stopping Samsung services over
Developer Mode (they come back within seconds), removing preinstalled apps over Developer
Mode (refused), or anything that needs root (risk of bricking).

Leave **Auto Update**, your Samsung account and the Smart Hub terms on: they are what keep
the store, TV Plus, SmartThings and firmware updates working.
