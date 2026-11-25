# Development

```
launcher/   Tizen web app: Preact + TypeScript UI (src/), ES5 watcher (service/), CSS, assets
cli/        tizenpure, Python 3.10+, only dependency `cryptography`
dns/        blocklists + allowlist (copied into cli/src/tizenpure/data/dns)
tests/      launcher unit tests (vitest) and watcher simulations (node:test)
tools/      build-launcher, build-icons, check-compat
```

```powershell
npm ci
npm run dev        # launcher in the browser against a mock TV (arrow keys, Enter, Esc, M)
npm run check      # lint, types, tests, build, Chromium 63 compat gate
python -m venv .venv; .venv\Scripts\pip install -e "cli[dev]"
.venv\Scripts\pytest cli/tests
```

Rules: animate only `transform`/`opacity`; keep `backdrop-filter` inside `@supports` and the
performance tiers; no network requests from the launcher; the watcher stays ES5 and every
behaviour change gets a simulation in `tests/service/watcher.test.cjs`.

Releases use release-please (conventional commits). The release workflow builds the
launcher, bundles it into the CLI and produces `tizenpure.exe` with PyInstaller.
