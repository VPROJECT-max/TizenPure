/* TizenPure watcher core. ES5 on purpose: it runs in the TV's web-service runtime.
 *
 * Ported in spirit from AeroTizen's HomeWatcher (MIT, (c) 2026 Hamza El Alaoui) and
 * rewritten for TizenPure with a stricter safety model:
 *
 *  - It never interrupts another app that is on screen or that it cannot see. Apps
 *    that never report `visible` (some YouTube/Prime builds) hold the watcher while they
 *    run, so playback and casting are never stolen twice (see ESCAPE below).
 *  - ESCAPE: if TizenPure is covered again within ESCAPE_WINDOW_MS of the watcher
 *    reopening it, and the user did not use TizenPure in between, the watcher stands
 *    aside until TizenPure is opened again. Pressing Home twice therefore always reaches
 *    Samsung Home, and a cast that was interrupted once goes through on the retry.
 *    Every pause lasts until the user comes back to TizenPure, never a fixed time, so a
 *    pause can never expire in the middle of something the user is watching.
 *  - CRASH LOOP: repeated service restarts, or launcher starts that never report healthy,
 *    disable the watcher persistently until the user re-enables it in Settings.
 *  - RATE LIMIT: more than MAX_RECLAIMS_PER_WINDOW reopenings in RECLAIM_WINDOW_MS pause it.
 *  - It only acts while the TV reports PowerState "on".
 *
 * All TV access goes through injected dependencies so tests can drive it with a fake
 * clock and a simulated TV.
 */
"use strict";

var C = {
  SELF: "TizenPure0.Home",
  POLL_MS: 400,
  BOOT_DELAY_MS: 3000,
  HIDDEN_GRACE_MS: 600,
  WATCHED_HIDDEN_GRACE_MS: 1500,
  APP_GRACE_MS: 2500,
  WATCH_COVER_GRACE_MS: 10000,
  WATCH_STOP_GRACE_MS: 1500,
  INVENTORY_SCAN_MS: 5000,
  LAUNCH_COOLDOWN_MS: 2000,
  ESCAPE_WINDOW_MS: 30000,
  RECLAIM_WINDOW_MS: 60000,
  MAX_RECLAIMS_PER_WINDOW: 6,
  LAUNCH_HEALTH_MS: 20000,
  LAUNCH_FAILURE_WINDOW_MS: 10 * 60 * 1000,
  MAX_LAUNCH_FAILURES: 3,
  START_LOOP_WINDOW_MS: 2 * 60 * 1000,
  MAX_STARTS_IN_WINDOW: 5,
  POWER_CHECK_MS: 5000,
  MAX_PARALLEL: 4,
  REQUEST_TIMEOUT_MS: 1500,
  HISTORY_LIMIT: 60
};

var MODES = { off: true, apps: true, home: true };

function defaultSettings() {
  return { version: 1, mode: "home", openOnBoot: true, disabled: null, starts: [], failures: [] };
}

// Versioned normalize: anything unknown or invalid falls back to the default value.
function normalizeSettings(value) {
  var d = defaultSettings();
  if (!value || typeof value !== "object" || value.version !== 1) {
    return d;
  }
  var nums = function (list) {
    var out = [];
    if (Object.prototype.toString.call(list) !== "[object Array]") {
      return out;
    }
    for (var i = 0; i < list.length && out.length < 20; i++) {
      if (typeof list[i] === "number" && isFinite(list[i])) {
        out.push(list[i]);
      }
    }
    return out;
  };
  return {
    version: 1,
    mode: MODES[value.mode] ? value.mode : d.mode,
    openOnBoot: typeof value.openOnBoot === "boolean" ? value.openOnBoot : d.openOnBoot,
    disabled:
      value.disabled && typeof value.disabled.reason === "string" && typeof value.disabled.at === "number"
        ? { reason: value.disabled.reason.slice(0, 120), at: value.disabled.at }
        : null,
    starts: nums(value.starts),
    failures: nums(value.failures)
  };
}

function recent(list, now, windowMs) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (now - list[i] < windowMs && list[i] <= now) {
      out.push(list[i]);
    }
  }
  return out;
}

/**
 * deps: {
 *   now(): number, setTimeout, clearTimeout, setInterval, clearInterval,
 *   appStatus(id, cb(status|null)): cancel   -- GET :8001/api/v2/applications/<id>
 *   tvInfo(cb(device|null)): cancel          -- GET :8001/api/v2/ -> device
 *   launchSelf(ok, failed)                   -- tizen.application.launch(SELF)
 *   load(): object|null, save(object): bool  -- persistent settings (may be null)
 * }
 */
function createWatcher(deps) {
  var settings = normalizeSettings(deps.load ? deps.load() : null);
  var persistent = !!deps.save;
  var s = {
    started: false,
    apps: [],
    running: {},
    snapAt: 0,
    selfVisible: null,
    hiddenSince: 0,
    watched: null,
    seen: false,
    watchAt: 0,
    watchedHiddenSince: 0,
    watchedRan: false,
    watchedStoppedSince: 0,
    unseenScanAt: 0,
    paused: null, // {reason, at}: lasts until api.home()
    lastReclaim: 0,
    reclaims: [],
    escapeArmedUntil: 0,
    pendingHealth: null,
    power: "unknown",
    frame: false,
    bootUntil: 0,
    bootDone: false,
    busy: false,
    epoch: 0,
    history: [],
    heartbeats: 0
  };
  var timers = { poll: null, power: null, boot: null, health: null };

  function now() {
    return deps.now();
  }
  function log(kind, detail) {
    s.history.push({ at: now(), kind: kind, detail: detail || "" });
    if (s.history.length > C.HISTORY_LIMIT) {
      s.history.shift();
    }
  }
  function persist() {
    if (!persistent) {
      return;
    }
    try {
      deps.save(settings);
    } catch (e) {
      log("store-failed", String(e && e.message));
    }
  }
  function active() {
    return s.started && !settings.disabled && settings.mode !== "off";
  }
  function disable(reason) {
    settings.disabled = { reason: reason, at: now() };
    persist();
    log("disabled", reason);
    invalidate();
  }
  // Paused until the launcher reports it is back on screen (api.home).
  function pause(reason) {
    s.paused = { reason: reason, at: now() };
    log("paused", reason);
    invalidate();
  }
  function pausedNow() {
    if (!s.paused) {
      return false;
    }
    return true;
  }
  function invalidate() {
    s.epoch += 1;
    s.busy = false;
  }
  function resetWatched() {
    s.watchedHiddenSince = 0;
    s.watchedRan = false;
    s.watchedStoppedSince = 0;
  }
  function resetTracking() {
    s.watched = null;
    s.seen = false;
    resetWatched();
    s.hiddenSince = 0;
    s.selfVisible = null;
    s.watchAt = now();
  }

  // -- crash-loop guard -------------------------------------------------------
  function recordStart() {
    var t = now();
    settings.starts = recent(settings.starts, t, C.START_LOOP_WINDOW_MS);
    settings.starts.push(t);
    persist();
    if (persistent && settings.starts.length >= C.MAX_STARTS_IN_WINDOW && !settings.disabled) {
      disable("service restarted " + settings.starts.length + " times in 2 minutes");
    }
  }
  function launchFailed(reason) {
    var t = now();
    settings.failures = recent(settings.failures, t, C.LAUNCH_FAILURE_WINDOW_MS);
    settings.failures.push(t);
    persist();
    log("launch-unhealthy", reason);
    if (settings.failures.length >= C.MAX_LAUNCH_FAILURES) {
      disable("TizenPure failed to start " + settings.failures.length + " times");
    }
  }
  function healthy() {
    if (s.pendingHealth) {
      deps.clearTimeout(timers.health);
      s.pendingHealth = null;
    }
    if (settings.failures.length) {
      settings.failures = [];
      persist();
    }
  }

  // -- reopening TizenPure ----------------------------------------------------
  function reclaim(why) {
    var t = now();
    if (!active() || pausedNow() || s.power !== "on" || t - s.lastReclaim < C.LAUNCH_COOLDOWN_MS) {
      return false;
    }
    if (s.escapeArmedUntil && t < s.escapeArmedUntil) {
      // Covered again right after we reopened, and the user did not use TizenPure:
      // they want something else (Samsung Home, a cast). Step aside.
      s.escapeArmedUntil = 0;
      pause("escape: covered again within " + C.ESCAPE_WINDOW_MS / 1000 + " s");
      return false;
    }
    s.reclaims = recent(s.reclaims, t, C.RECLAIM_WINDOW_MS);
    if (s.reclaims.length >= C.MAX_RECLAIMS_PER_WINDOW) {
      pause("rate limit");
      return false;
    }
    s.reclaims.push(t);
    s.lastReclaim = t;
    s.escapeArmedUntil = t + C.ESCAPE_WINDOW_MS;
    s.watched = null;
    s.seen = false;
    resetWatched();
    log("reclaim", why);
    s.pendingHealth = { at: t, why: why };
    deps.clearTimeout(timers.health);
    timers.health = deps.setTimeout(function () {
      if (s.pendingHealth) {
        s.pendingHealth = null;
        launchFailed("no healthy report after " + why);
      }
    }, C.LAUNCH_HEALTH_MS);
    try {
      deps.launchSelf(
        function () {},
        function (e) {
          log("launch-error", String(e && e.message));
        }
      );
    } catch (e) {
      log("launch-threw", String(e && e.message));
    }
    return true;
  }

  // -- app inventory ----------------------------------------------------------
  function snapshot(cb) {
    var ids = s.apps.slice();
    var result = { running: {}, visible: null, complete: true };
    if (!ids.length) {
      cb(result);
      return;
    }
    var index = 0;
    var left = ids.length;
    var inflight = 0;
    function next() {
      while (inflight < C.MAX_PARALLEL && index < ids.length) {
        ask(ids[index]);
        index += 1;
      }
    }
    function ask(id) {
      inflight += 1;
      deps.appStatus(id, function (value) {
        inflight -= 1;
        left -= 1;
        if (!value) {
          result.complete = false;
        } else {
          result.running[id] = !!value.running;
          if (value.visible) {
            result.visible = id;
          }
        }
        if (left === 0) {
          cb(result);
        } else {
          next();
        }
      });
    }
    next();
  }
  // Follow an app that appeared while TizenPure was hidden. Returns true when found.
  function standAside(result, except) {
    var id = result.visible;
    if (!id) {
      for (var key in result.running) {
        if (key !== except && result.running[key] && !s.running[key]) {
          id = key;
          break;
        }
      }
    }
    for (var k in result.running) {
      s.running[k] = result.running[k];
    }
    if (!id) {
      return false;
    }
    s.watched = id;
    s.seen = result.visible === id;
    resetWatched();
    log("stand-aside", id);
    return true;
  }

  // -- main loop --------------------------------------------------------------
  function tick() {
    s.heartbeats += 1;
    if (!active() || s.busy || pausedNow() || now() < s.bootUntil) {
      return;
    }
    s.busy = true;
    var epoch = s.epoch;
    function done() {
      if (epoch === s.epoch) {
        s.busy = false;
      }
    }
    function valid() {
      return epoch === s.epoch && active();
    }
    deps.appStatus(C.SELF, function (me) {
      if (!valid() || !me) {
        done();
        return;
      }
      var t = now();
      if (me.visible) {
        s.selfVisible = true;
        s.hiddenSince = 0;
        if (t - s.watchAt >= C.WATCH_COVER_GRACE_MS) {
          s.watched = null;
          s.seen = false;
          resetWatched();
        }
        if (t - s.snapAt > C.INVENTORY_SCAN_MS) {
          s.snapAt = t;
          snapshot(function (result) {
            if (valid()) {
              for (var k in result.running) {
                s.running[k] = result.running[k];
              }
            }
            done();
          });
          return;
        }
        done();
        return;
      }
      if (s.selfVisible !== false) {
        s.hiddenSince = t;
      }
      s.selfVisible = false;
      var settling = t - s.hiddenSince < C.HIDDEN_GRACE_MS || t - s.watchAt < C.APP_GRACE_MS;
      if (s.watched) {
        watchedTick(s.watched, valid, done);
        return;
      }
      if (settling || settings.mode !== "home" || s.frame) {
        done();
        return;
      }
      snapshot(function (result) {
        if (!valid() || s.watched) {
          done();
          return;
        }
        // An incomplete inventory can hide a playing app: never reclaim on partial data.
        if (result.complete && !standAside(result)) {
          reclaim("covered without an app");
        }
        done();
      });
    });
  }
  function watchedTick(id, valid, done) {
    deps.appStatus(id, function (w) {
      if (!valid() || s.watched !== id || !w) {
        done();
        return;
      }
      var t = now();
      if (w.visible) {
        s.seen = true;
        s.watchedHiddenSince = 0;
      } else if (s.seen) {
        if (!s.watchedHiddenSince) {
          s.watchedHiddenSince = t;
        }
        if (t - s.watchedHiddenSince >= C.WATCHED_HIDDEN_GRACE_MS) {
          // It was on screen and has left: Home was pressed inside it, or it closed.
          // Make sure nothing else took the screen (a cast, another app) first.
          snapshot(function (result) {
            if (valid() && s.watched === id && result.complete && !standAside(result, id)) {
              reclaim("left " + id);
            }
            done();
          });
          return;
        }
      } else if (w.running) {
        // Silent app: running, never said visible. Hold, but follow any app that does.
        s.watchedRan = true;
        s.watchedStoppedSince = 0;
        if (t - s.unseenScanAt >= C.INVENTORY_SCAN_MS) {
          s.unseenScanAt = t;
          snapshot(function (result) {
            if (valid() && s.watched === id && result.visible && result.visible !== id) {
              standAside(result, id);
            }
            done();
          });
          return;
        }
      } else if (s.watchedRan) {
        if (!s.watchedStoppedSince) {
          s.watchedStoppedSince = t;
        }
        if (t - s.watchedStoppedSince >= C.WATCH_STOP_GRACE_MS) {
          log("unwatched", id + " stopped");
          s.watched = null;
          resetWatched();
          s.hiddenSince = t; // give the TV a moment to show whatever comes next
        }
      } else if (t - s.watchAt >= C.WATCH_COVER_GRACE_MS) {
        // Asked to watch an app that never ran or showed: forget it.
        s.watched = null;
        resetWatched();
      }
      done();
    });
  }
  function checkPower() {
    deps.tvInfo(function (device) {
      if (!device) {
        s.power = "unknown";
        return;
      }
      s.frame = device.FrameTVSupport === "true" || device.FrameTVSupport === true;
      s.power = device.PowerState === "on" || device.PowerState === undefined ? "on" : String(device.PowerState);
      if (!s.bootDone && now() >= s.bootUntil) {
        bootLaunch();
      }
    });
  }
  function bootLaunch() {
    s.bootDone = true;
    if (!active() || !settings.openOnBoot || s.frame) {
      return;
    }
    deps.appStatus(C.SELF, function (me) {
      if (me && me.visible) {
        return;
      }
      snapshot(function (result) {
        if (!result.visible && active()) {
          reclaim("boot");
          s.escapeArmedUntil = 0; // a boot open is not a reclaim the user can escape from
        }
      });
    });
  }

  // -- requests from the launcher ----------------------------------------------
  var api = {
    start: function () {
      if (s.started) {
        return;
      }
      s.started = true;
      s.bootUntil = now() + C.BOOT_DELAY_MS;
      recordStart();
      log("start", settings.disabled ? "disabled: " + settings.disabled.reason : settings.mode);
      timers.poll = deps.setInterval(tick, C.POLL_MS);
      timers.power = deps.setInterval(checkPower, C.POWER_CHECK_MS);
      timers.boot = deps.setTimeout(checkPower, C.BOOT_DELAY_MS);
    },
    stop: function () {
      s.started = false;
      deps.clearInterval(timers.poll);
      deps.clearInterval(timers.power);
      deps.clearTimeout(timers.boot);
      deps.clearTimeout(timers.health);
      invalidate();
    },
    // The launcher is on screen and working.
    home: function () {
      healthy();
      if (settings.starts.length) {
        settings.starts = [];
        persist();
      }
      resetTracking();
      if (s.paused) {
        log("resumed", s.paused.reason);
        s.paused = null;
      }
      invalidate();
    },
    // The user pressed a key in the launcher: they are using TizenPure.
    activity: function () {
      s.escapeArmedUntil = 0;
    },
    watch: function (id) {
      s.escapeArmedUntil = 0;
      s.watched = id || null;
      s.seen = false;
      resetWatched();
      s.watchAt = now();
      s.paused = null;
      invalidate();
    },
    // Opening something the watcher cannot see (Live TV, HDMI, Samsung Home): stand
    // aside until the launcher is back.
    leave: function (reason) {
      s.escapeArmedUntil = 0;
      resetTracking();
      pause(reason || "leave");
    },
    apps: function (ids) {
      s.apps = ids.slice(0, 200);
      s.snapAt = 0;
      invalidate();
    },
    setMode: function (mode) {
      if (!MODES[mode]) {
        return false;
      }
      settings.mode = mode;
      persist();
      invalidate();
      return true;
    },
    setOpenOnBoot: function (value) {
      settings.openOnBoot = !!value;
      persist();
    },
    // Explicit user action from Settings: clear a crash-loop disable.
    enable: function () {
      settings.disabled = null;
      settings.failures = [];
      settings.starts = [];
      s.paused = null;
      persist();
      log("enabled", "by user");
      invalidate();
    },
    disable: function () {
      disable("turned off by user");
    },
    status: function () {
      return {
        protocol: 1,
        app_id: C.SELF,
        mode: settings.mode,
        openOnBoot: settings.openOnBoot,
        disabled: settings.disabled,
        persistent: persistent,
        paused: pausedNow() ? s.paused : null,
        watched: s.watched,
        seen: s.seen,
        power: s.power,
        frame: s.frame,
        heartbeats: s.heartbeats,
        failures: settings.failures.length,
        history: s.history.slice(-20)
      };
    },
    _state: s,
    _settings: function () {
      return settings;
    }
  };
  return api;
}

module.exports = { createWatcher: createWatcher, normalizeSettings: normalizeSettings, constants: C };
