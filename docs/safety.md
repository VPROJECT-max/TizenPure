# Safety, watcher rules and recovery

## Hard rules

TizenPure never uses root, never changes firmware or the service menu, and never flashes
anything. Every TV-side change is app-level (installing or removing an app) or something
you do yourself in Samsung's own menus.

| Action | Class | How to undo |
|---|---|---|
| `discover`, `doctor`, `apps`, `watcher probe` | read-only | nothing to undo |
| `certs` | PC only | delete the folder it prints |
| `install` / `uninstall` TizenPure | app-level | `tizenpure uninstall launcher`, or delete it in Apps |
| `debloat --apply` (user-removable store apps only) | app-level | reinstall from the Samsung store |
| Watcher runs at boot | app-level | Settings → Home button → *Open Samsung Home*, or uninstall |
| DNS blocking | network | set DNS back to automatic, or remove the list from your resolver |
| Privacy toggles | done by you on the TV | switch them back in the same menu |

Before a change the CLI checks the TV's identity, firmware and model tier, asks you to
confirm, saves an app-list snapshot to your private folder, makes the change, and reads
the app list back to verify it.

## Recovery ladder

1. **Back / Exit** on the remote.
2. **Home** on the remote. Apps cannot capture this button, so Samsung Home always opens.
   If TizenPure comes back, press Home **again within 30 seconds**: the watcher stands aside
   until you open TizenPure yourself.
3. **Hold Power** until the TV restarts.
4. Delete TizenPure on the TV: **Apps → Settings (gear) → TizenPure → Delete**.
5. From the PC: `tizenpure uninstall launcher`.
6. **Settings → Support → Device Care → Self Diagnosis → Reset Smart Hub**.
7. Factory reset, as a last resort.

Never use the service menu or a USB reflash unless Samsung support tells you to.

## Watcher rules

The watcher is a Tizen background service. It polls the TV's own local API on
`127.0.0.1:8001` every 0.4 s (cheap enough for low-end sets) and talks to the launcher on
`127.0.0.1:47391`. It reopens TizenPure only when **all** of these hold:

- the TV reports `PowerState: on`;
- the watcher is not turned off, paused or disabled;
- TizenPure is not on screen;
- either an app you opened from TizenPure was on screen and has left (you pressed Home in
  it), or TizenPure was covered and the full app inventory shows no app on screen and no
  app that newly started (that is Samsung Home);
- the inventory answered completely (partial data never triggers a reopen).

It stands aside, and never steals the screen, when:

- **an app is on screen**, or an app started while TizenPure was hidden (a cast);
- **an app never reports being visible** (some YouTube and Prime Video builds): it is left
  alone for as long as it runs. Home inside such an app then shows Samsung Home; use Back or
  open TizenPure from there. `tizenpure watcher probe` shows which of your apps behave this way;
- you opened **Live TV, an HDMI input, TV settings or Samsung Home** from TizenPure;
- you pressed Home **again within 30 s** of it reopening TizenPure without using TizenPure in
  between (the *escape* rule). A cast into an app that was already running in the background
  looks exactly like Samsung Home to the TV's API, so it can be interrupted once; casting
  again goes through and is left alone;
- it has reopened TizenPure 6 times in a minute (a fight with something: it pauses);
- the TV is a Frame TV (Art Mode would be interrupted): only "return from apps" applies.

Every pause lasts until you come back to TizenPure, never a fixed time, so a pause can
never end in the middle of something you are watching.

### Crash-loop protection

The watcher keeps a small file in the app's private storage:

- if the service restarts 5 times within 2 minutes before TizenPure reports it started
  correctly, the watcher **disables itself**;
- if TizenPure is reopened 3 times within 10 minutes and never reports that it is on screen
  (a broken launcher), the watcher **disables itself**.

A disabled watcher stays off across reboots. Only you can turn it back on, from
**Settings → Home button**. Normal reboots never count towards these limits.

## Developer Mode

Samsung advisory SVE-2025-50109 describes command injection through the developer
install command from the configured Host PC address on Tizen 9 and earlier. Turn Developer
Mode **off** when you are done: TizenPure keeps working, and you only need Developer Mode
again to update or uninstall it from the PC (you can always delete it in Apps). Verify on
your set once: turn Developer Mode off, restart the TV and check TizenPure still opens.

## Native Home

Assigning TizenPure as the TV's native Home app needs a privileged mechanism and is **not
part of v0.1**. If it is added later it will be a separate, opt-in module that requires a
backup and a proven restore first.
