# Privacy: DNS and Samsung settings

Tizen 6+ does not allow removing preinstalled apps over Developer Mode, so "debloat" on a
Samsung TV means four reversible things: DNS blocking, Samsung's own privacy toggles,
removing user-removable store apps you choose, and a quiet launcher.

## What keeps working

Samsung account, SmartThings, Samsung TV Plus / Live TV, automatic firmware updates, the
app store, casting, and every streaming app. `dns/allowlist.txt` lists the domains they
need; `tizenpure dns lint` (also run in CI) fails if any blocklist entry would block one.

## DNS

| List | What it blocks |
|---|---|
| `dns/samsung-ads.txt` (safe) | Smart Hub ad delivery, automatic content recognition (ACR), usage telemetry |
| `dns/samsung-aggressive.txt` | the safe list plus Smart Hub banners, notices and recommendation feeds |

Unlike some community lists, neither blocks `samsungotn.net` (firmware updates),
`samsungcloudsolution.com/.net` (store, TV Plus, account) or `pavv.co.kr`.

```powershell
.\tizenpure.exe dns export --tier safe --format hosts -o samsung-safe.txt
```

Formats: `plain`, `hosts`, `adblock`, `dnsmasq`. `--hagezi` also downloads HaGeZi's Samsung
list (GPL-3.0, fetched on your PC, filtered against the allowlist, never bundled).

**Router / home resolver** (most reliable): load the list in Pi-hole, AdGuard Home or
NextDNS, and add `allowlist.txt` as allowed domains.

**Public filtering DNS on the TV**: Settings → All Settings → Connection → Network →
Network Status → IP Settings → DNS Setting: *Enter manually* → `94.140.14.14` (AdGuard DNS).
Restart the TV and re-open IP Settings: some 2023 sets revert to automatic, in which case
use your router. Undo: *Obtain automatically*. `tizenpure dns guide` prints this.

## Samsung settings checklist

`tizenpure privacy` prints it. In short (labels vary by year and region):

- **Privacy Choices** (General & Privacy → Terms & Privacy): Viewing Information Services
  (ACR) **off**, Interest-Based Advertisement **off**, Voice Recognition **off** unless you use
  it, personalised recommendations **off**, and **Reset PSID** once.
- **Start Screen Options**: *Start with Smart Hub Home* off (the watcher opens TizenPure),
  *Autorun Samsung TV Plus* off. TV Plus itself keeps working.
- Keep **Auto Update** on and stay signed in to your Samsung account.

## Store apps

```powershell
.\tizenpure.exe debloat
```

prints what could go, grouped as `bloat` (suggested), `optional` (only if you name it) and
`keep` (streaming and services; refused unless you add `--allow-keep`). Nothing is removed
without `--remove PKGID --apply` and a confirmation. Removed apps can be reinstalled from
the store. The TV refuses to remove preinstalled apps over Developer Mode; delete or
disable those in **Apps → Settings** on the TV.
