// Compatibility + safety gate for the built TV package (run after `npm run build`):
//  - the UI bundle parses as ES2018 script (Chromium 63 floor), the watcher as ES5
//  - CSS avoids features newer than Chromium 63, and backdrop-filter only inside @supports
//  - the bundle contacts nothing but the TV's own loopback services
//  - config.xml asks only for the public-level privileges TizenPure needs
import { parse } from "acorn";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "dist/launcher");
const problems = [];
const read = (p) => readFile(path.join(out, p), "utf8");

const app = await read("js/app.js");
try {
  parse(app, { ecmaVersion: 2018, sourceType: "script" });
} catch (e) {
  problems.push(`js/app.js is not ES2018: ${e.message}`);
}
for (const f of ["service/index.js", "service/watcher-core.js"]) {
  try {
    parse(await read(f), { ecmaVersion: 5, sourceType: "script" });
  } catch (e) {
    problems.push(`${f} is not ES5: ${e.message}`);
  }
}

const ALLOWED_URL = /^https?:\/\/(127\.0\.0\.1(:\d+)?|tizen\.org\/|www\.w3\.org\/)/;
for (const url of new Set(app.match(/https?:\/\/[^\s"'`)]+/g) || [])) {
  if (!ALLOWED_URL.test(url)) problems.push(`bundle references an external URL: ${url}`);
}

const css = await read("css/app.css");
const withoutSupports = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const BANNED_CSS = [
  [/backdrop-filter\s*:/, "backdrop-filter outside @supports"],
  [/(^|[;{\s])gap\s*:/m, "`gap` (use grid-gap; Chromium 66+)"],
  [/\bclamp\(/, "clamp() (Chromium 79+)"],
  [/(^|[;{\s])inset\s*:/m, "inset (Chromium 87+)"],
  [/aspect-ratio\s*:/, "aspect-ratio (Chromium 88+)"],
  [/:focus-visible|:is\(|:where\(|:has\(/, "modern selectors"],
  [/revert-layer|\d(cqw|cqh|cqi|cqb|svh|dvh|lvh)\b/, "container/viewport units or revert-layer"],
];
for (const [pattern, label] of BANNED_CSS) {
  if (pattern.test(withoutSupports)) problems.push(`css/app.css uses ${label}`);
}

const config = await read("config.xml");
const PUBLIC = new Set([
  "internet",
  "filesystem.read",
  "filesystem.write",
  "application.launch",
  "application.info",
  "tv.window",
  "tv.inputdevice",
]);
for (const [, name] of config.matchAll(/<tizen:privilege name="http:\/\/tizen\.org\/privilege\/([^"]+)"/g)) {
  if (!PUBLIC.has(name)) problems.push(`config.xml requests a privilege outside the public set: ${name}`);
}
if (/developer\.samsung\.com\/privilege|partner|platform/i.test(config.replace(/<!--[\s\S]*?-->/g, ""))) {
  problems.push("config.xml mentions a partner/platform privilege");
}
if (!/<tizen:application id="TizenPure0\.Home" package="TizenPure0"/.test(config)) problems.push("unexpected app id");

if (problems.length) {
  for (const p of problems) console.error("!!", p);
  process.exit(1);
}
console.log("Compat OK: ES2018 UI, ES5 watcher, Chromium 63 CSS, loopback-only network, public privileges.");
