// Build the TV package into dist/launcher:
//   js/app.js      the UI as one classic IIFE script (no ES modules over file://), Chromium 63
//   css/app.css    copied as-is (hand-written for the Chromium 63 floor; see tools/check-compat.mjs)
//   service/*.js   the ES5 watcher, copied as-is (already plain ES5, tested by node)
//   assets/, icon.png, config.xml, index.html (production template)
import preact from "@preact/preset-vite";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(root, "launcher");
const out = path.join(root, "dist/launcher");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const config = await readFile(path.join(src, "config.xml"), "utf8");
const widgetVersion = config.match(/<widget[^>]*\sversion="([^"]+)"/)[1];
if (widgetVersion !== pkg.version) throw new Error(`config.xml version ${widgetVersion} != package.json ${pkg.version}`);

const serviceSources = ["index.js", "watcher-core.js"];
const serviceHash = createHash("sha256");
for (const file of serviceSources) serviceHash.update(await readFile(path.join(src, "service", file)));
const serviceBuild = serviceHash.digest("hex").slice(0, 12);

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "js"), { recursive: true });
await build({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SERVICE_BUILD__: JSON.stringify(serviceBuild),
    "process.env.NODE_ENV": '"production"',
  },
  build: {
    outDir: path.join(out, "js"),
    emptyOutDir: false,
    target: ["chrome63"],
    minify: true,
    cssCodeSplit: false,
    lib: { entry: path.join(src, "src/main.tsx"), formats: ["iife"], name: "TizenPure", fileName: () => "app.js" },
  },
});
await cp(path.join(src, "css"), path.join(out, "css"), { recursive: true });
await cp(path.join(src, "assets"), path.join(out, "assets"), { recursive: true });
await mkdir(path.join(out, "service"), { recursive: true });
for (const file of serviceSources) {
  const text = await readFile(path.join(src, "service", file), "utf8");
  await writeFile(path.join(out, "service", file), text.replace('"__SERVICE_BUILD__"', JSON.stringify(serviceBuild)));
}
await cp(path.join(src, "icon.png"), path.join(out, "icon.png"));
await cp(path.join(src, "config.xml"), path.join(out, "config.xml"));
const html = (await readFile(path.join(src, "index.html"), "utf8")).replace(
  /<script type="module" src="\.\/src\/main\.tsx"><\/script>/,
  '<script src="js/app.js"></script>',
);
if (html.includes("main.tsx")) throw new Error("index.html template did not match");
await writeFile(path.join(out, "index.html"), html);
console.log(`Built ${path.relative(root, out)} (TizenPure ${pkg.version}).`);
