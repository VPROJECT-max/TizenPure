"use strict";
// A simulated Samsung TV + fake clock for driving the watcher core deterministically.

const { createWatcher, constants } = require("../../launcher/service/watcher-core.js");

const API_LATENCY_MS = 20;

function createClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => {
    const id = ++seq;
    timers.set(id, { fn, at: now + Math.max(0, ms), every });
    return id;
  };
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) {
          if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
        }
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at += t.every;
        else timers.delete(id);
        t.fn();
      }
      now = end;
    },
  };
}

function createStore(initial) {
  let value = initial === undefined ? null : JSON.parse(JSON.stringify(initial));
  return {
    load: () => (value ? JSON.parse(JSON.stringify(value)) : null),
    save: (v) => {
      value = JSON.parse(JSON.stringify(v));
    },
    peek: () => value,
  };
}

/**
 * apps: { storeId: { running, visible, silent } } - silent apps never report visible.
 * The launcher is constants.SELF. `launcherHealthy=false` simulates a broken launcher
 * that never reports /home after being opened.
 */
function createTv({ clock, apps = {}, power = "on", frame = false, launcherHealthy = true, failIds = [] } = {}) {
  const state = {
    apps: { [constants.SELF]: { running: true, visible: true }, ...apps },
    power,
    frame,
    launches: 0,
    launcherHealthy,
    failIds: new Set(failIds),
    watcher: null,
    front: constants.SELF,
  };
  const show = (id) => {
    for (const [key, app] of Object.entries(state.apps)) app.visible = key === id && !app.silent;
    state.front = id;
    if (id && state.apps[id]) state.apps[id].running = true;
  };
  const tv = {
    state,
    deps: {
      appStatus(id, cb) {
        clock.setTimeout(() => {
          if (state.failIds.has(id)) return cb(null);
          const app = state.apps[id];
          cb(app ? { running: !!app.running, visible: !!app.visible } : null);
        }, API_LATENCY_MS);
        return () => {};
      },
      tvInfo(cb) {
        clock.setTimeout(() => cb({ PowerState: state.power, FrameTVSupport: state.frame ? "true" : "false" }), API_LATENCY_MS);
        return () => {};
      },
      launchSelf(ok) {
        state.launches += 1;
        clock.setTimeout(() => {
          show(constants.SELF);
          ok();
          if (state.launcherHealthy && tv.watcher) tv.watcher.home();
        }, 300);
      },
    },
    // What the user / the TV does:
    samsungHome() {
      show(null); // Samsung Home is not reported by the REST API
    },
    open(id) {
      show(id);
    },
    openFromLauncher(id) {
      tv.watcher.watch(id);
      show(id);
    },
    returnToLauncher() {
      show(constants.SELF);
      tv.watcher.home();
    },
    close(id) {
      state.apps[id].running = false;
      state.apps[id].visible = false;
      show(null);
    },
  };
  return tv;
}

function boot(options = {}) {
  const clock = options.clock || createClock();
  const tv = createTv({ clock, ...options });
  const store = options.store || createStore();
  const watcher = createWatcher({ ...tv.deps, ...clock, load: store.load, save: store.save });
  tv.watcher = watcher;
  watcher.start();
  watcher.apps(Object.keys(options.apps || {}));
  if (options.healthyAtBoot !== false) watcher.home(); // launcher opened and healthy
  clock.advance(constants.BOOT_DELAY_MS + 2000);
  return { clock, tv, watcher, store };
}

module.exports = { createClock, createStore, createTv, boot, constants };
