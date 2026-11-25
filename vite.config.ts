// Development server only (`npm run dev`): the launcher runs against the mock platform.
// TV packages are built by tools/build-launcher.mjs.
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  root: "launcher",
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __SERVICE_BUILD__: JSON.stringify("dev") },
  server: { port: 5178 },
  test: {
    root: ".",
    include: ["tests/launcher/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});
