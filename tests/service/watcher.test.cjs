"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const acorn = require("acorn");

const { boot, createStore, constants: C } = require("./fake-tv.cjs");
const { normalizeSettings } = require("../../launcher/service/watcher-core.js");

const NETFLIX = "3201907018807";
const YOUTUBE = "111299001912";
const DISNEY = "3201901017640";
const MINUTE = 60_000;

const streaming = () => ({
  [NETFLIX]: { running: true, visible: false }, // pre-launched, reports visibility
  [YOUTUBE]: { running: true, visible: false, silent: true }, // pre-launched, never reports visible
  [DISNEY]: { running: false, visible: false },
});

test("Home on TizenPure: Samsung Home is covered and TizenPure comes back", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.samsungHome();
  clock.advance(3000);
  assert.equal(tv.state.launches, 1);
  assert.equal(tv.state.front, C.SELF);
});

test("Home inside an app that reports visibility returns to TizenPure", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.openFromLauncher(NETFLIX);
  clock.advance(30_000); // watching
  assert.equal(tv.state.launches, 0, "never interrupts the app while it is on screen");
  tv.samsungHome();
  clock.advance(4000);
  assert.equal(tv.state.launches, 1);
});

test("a silent app (never reports visible) is never interrupted while it runs", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.openFromLauncher(YOUTUBE);
  clock.advance(30 * MINUTE);
  assert.equal(tv.state.launches, 0);
  assert.equal(tv.state.front, YOUTUBE);
});

test("an app opened elsewhere that reports visible is followed, not interrupted", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.open(DISNEY); // e.g. cast from a phone, Disney+ reports visible
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("a cast into a silent pre-launched app is interrupted at most once", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  tv.open(YOUTUBE); // looks exactly like Samsung Home to the API
  clock.advance(3000);
  assert.equal(tv.state.launches, 1, "first cover is indistinguishable from Samsung Home");
  tv.open(YOUTUBE); // the user casts again
  clock.advance(60 * MINUTE);
  assert.equal(tv.state.launches, 1, "the retry goes through and is never interrupted");
  assert.match(watcher.status().paused.reason, /escape/);
});

test("pressing Home twice reaches Samsung Home and it stays", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.samsungHome();
  clock.advance(3000);
  tv.samsungHome();
  clock.advance(60 * MINUTE);
  assert.equal(tv.state.launches, 1);
  assert.equal(tv.state.front, null);
});

test("using TizenPure between two Home presses keeps normal behaviour", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  tv.samsungHome();
  clock.advance(3000);
  watcher.activity(); // a key press in the launcher
  tv.samsungHome();
  clock.advance(3000);
  assert.equal(tv.state.launches, 2);
});

test("returning to TizenPure ends a pause", () => {
  const { clock, tv } = boot({ apps: streaming() });
  tv.samsungHome();
  clock.advance(3000);
  tv.samsungHome();
  clock.advance(5000); // escaped
  tv.returnToLauncher();
  clock.advance(C.ESCAPE_WINDOW_MS + 1000);
  tv.samsungHome();
  clock.advance(3000);
  assert.equal(tv.state.launches, 2);
});

test("a launcher that never reports healthy disables the watcher persistently", () => {
  const store = createStore();
  const { clock, tv, watcher } = boot({ apps: streaming(), launcherHealthy: false, store });
  for (let i = 0; i < 5; i += 1) {
    watcher.activity(); // defeat the escape rule so only the health rule is tested
    tv.samsungHome();
    clock.advance(C.LAUNCH_HEALTH_MS + 3000);
  }
  assert.equal(tv.state.launches, C.MAX_LAUNCH_FAILURES);
  assert.match(watcher.status().disabled.reason, /failed to start/);
  // A TV restart does not re-enable it.
  const again = boot({ apps: streaming(), store });
  again.tv.samsungHome();
  again.clock.advance(10 * MINUTE);
  assert.equal(again.tv.state.launches, 0);
  // Only the user can (from TizenPure's Settings, so TizenPure is on screen).
  again.tv.returnToLauncher();
  again.watcher.enable();
  again.clock.advance(C.INVENTORY_SCAN_MS + 1000);
  again.tv.samsungHome();
  again.clock.advance(3000);
  assert.equal(again.tv.state.launches, 1);
});

test("a service restart loop disables the watcher", () => {
  const store = createStore();
  for (let i = 0; i < C.MAX_STARTS_IN_WINDOW; i += 1) {
    const { watcher } = boot({ store, apps: {}, healthyAtBoot: false }); // crashes before the launcher reports
    watcher.stop();
  }
  assert.match(store.peek().disabled.reason, /restarted/);
});

test("normal reboots never count as a restart loop", () => {
  const store = createStore();
  for (let i = 0; i < 10; i += 1) boot({ store, apps: {} }).watcher.stop();
  assert.equal(store.peek().disabled, null);
});

test("nothing happens while the TV is in standby", () => {
  const { clock, tv } = boot({ apps: streaming(), power: "standby" });
  clock.advance(10_000);
  tv.samsungHome();
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("an incomplete inventory never triggers a reopen", () => {
  const { clock, tv } = boot({ apps: streaming(), failIds: [DISNEY] });
  tv.samsungHome();
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("'apps' mode returns from apps but leaves Samsung Home alone", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  watcher.setMode("apps");
  tv.samsungHome();
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
  tv.returnToLauncher();
  tv.openFromLauncher(NETFLIX);
  clock.advance(10_000);
  tv.samsungHome();
  clock.advance(4000);
  assert.equal(tv.state.launches, 1);
});

test("'off' mode never reopens anything", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  watcher.setMode("off");
  tv.samsungHome();
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("leaving for Live TV / HDMI / Samsung Home stands aside until TizenPure is back", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  watcher.leave("hdmi");
  tv.samsungHome();
  clock.advance(60 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("a fight with another app is rate limited", () => {
  const { clock, tv, watcher } = boot({ apps: streaming() });
  for (let i = 0; i < 20; i += 1) {
    watcher.activity();
    tv.samsungHome();
    clock.advance(2500);
  }
  assert.ok(tv.state.launches <= C.MAX_RECLAIMS_PER_WINDOW);
});

test("Frame TVs never get the Samsung-Home takeover (Art Mode safety)", () => {
  const { clock, tv } = boot({ apps: streaming(), frame: true });
  clock.advance(10_000);
  tv.samsungHome();
  clock.advance(10 * MINUTE);
  assert.equal(tv.state.launches, 0);
});

test("settings normalize rejects unknown or invalid data", () => {
  assert.equal(normalizeSettings(null).mode, "home");
  assert.equal(normalizeSettings({ version: 2, mode: "off" }).mode, "home");
  assert.equal(normalizeSettings({ version: 1, mode: "evil" }).mode, "home");
  assert.equal(normalizeSettings({ version: 1, mode: "apps" }).mode, "apps");
  assert.deepEqual(normalizeSettings({ version: 1, starts: ["x", 5, null] }).starts, [5]);
  assert.equal(normalizeSettings({ version: 1, disabled: { reason: 1 } }).disabled, null);
});

test("service files are plain ES5", () => {
  const dir = path.join(__dirname, "../../launcher/service");
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    assert.doesNotThrow(() => acorn.parse(fs.readFileSync(path.join(dir, name), "utf8"), { ecmaVersion: 5 }), name);
  }
});

test("control endpoints refuse foreign pages", () => {
  const service = require("../../launcher/service/index.js");
  const { watcher } = boot({ apps: {} });
  service._setWatcher(watcher);
  const call = (method, url, headers = {}) => {
    const out = {};
    service._handle(
      { method, url, headers },
      { writeHead: (code) => (out.code = code), end: (body) => (out.body = body) },
    );
    return out;
  };
  assert.equal(call("POST", "/mode?mode=off", { origin: "https://evil.example", "x-tizenpure": "1" }).code, 403);
  assert.equal(call("POST", "/mode?mode=off", {}).code, 403);
  assert.equal(call("POST", "/mode?mode=off", { origin: "file://", "x-tizenpure": "1" }).code, 200);
  assert.equal(watcher.status().mode, "off");
  assert.equal(call("GET", "/status").code, 200);
  assert.equal(call("GET", "/nope").code, 404);
});
