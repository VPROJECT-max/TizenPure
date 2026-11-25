/* TizenPure watcher service entry (Tizen web service, Node-style runtime, ES5).
 *
 * Starts on boot (config.xml: on-boot="true" auto-restart="true"), polls the TV's own
 * loopback API on :8001 and reopens TizenPure when Samsung Home covers it. The launcher
 * talks to it on http://127.0.0.1:47391. See watcher-core.js for the safety rules.
 */
"use strict";

var http = require("http");
var core = require("./watcher-core");

var CONTROL_HOST = "127.0.0.1";
var CONTROL_PORT = 47391;
var TV_API_PORT = 8001;
var APPS_PATH = "/api/v2/applications/";
var INFO_PATH = "/api/v2/";
var MAX_REPLY = 65536;
var MAX_BODY = 4096;
var STORE_FILE = "tizenpure-watcher-v1.json";
var OK = 200;
var CONTROL_HEADER = "x-tizenpure";
var LAUNCHER_ORIGINS = { "null": true, "file://": true };

var watcher = null;
var server = null;
var storePath = null;
var fs = null;
try {
  fs = require("fs");
} catch (e) {
  fs = null;
}

function getJson(path, cb) {
  var settled = false;
  var req = null;
  function finish(value) {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      cb(value);
    }
  }
  var timer = setTimeout(function () {
    finish(null);
    if (req) {
      req.destroy();
    }
  }, core.constants.REQUEST_TIMEOUT_MS);
  try {
    req = http.get({ host: CONTROL_HOST, port: TV_API_PORT, path: path }, function (res) {
      var body = "";
      res.on("data", function (chunk) {
        body += chunk.toString();
        if (body.length > MAX_REPLY) {
          finish(null);
          req.destroy();
        }
      });
      res.on("error", function () {
        finish(null);
      });
      res.on("end", function () {
        if (res.statusCode !== OK) {
          finish(null);
          return;
        }
        try {
          var value = JSON.parse(body);
          finish(value && typeof value === "object" ? value : null);
        } catch (e) {
          finish(null);
        }
      });
    });
    req.on("error", function () {
      finish(null);
    });
  } catch (e) {
    finish(null);
  }
  return function () {
    finish(null);
  };
}

function appStatus(id, cb) {
  return getJson(APPS_PATH + encodeURIComponent(id), function (v) {
    cb(v && typeof v.running === "boolean" && typeof v.visible === "boolean" ? v : null);
  });
}

function tvInfo(cb) {
  return getJson(INFO_PATH, function (v) {
    cb(v && v.device && typeof v.device === "object" ? v.device : null);
  });
}

function launchSelf(ok, failed) {
  tizen.application.launch(core.constants.SELF, ok, failed);
}

function load() {
  if (!fs || !storePath) {
    return null;
  }
  try {
    var text = fs.readFileSync(storePath, "utf8");
    return text.length <= MAX_BODY * 4 ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

function save(value) {
  var text = JSON.stringify(value);
  var temporary = storePath + ".tmp";
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, storePath);
}

function resolveStore(done) {
  try {
    tizen.filesystem.resolve(
      "wgt-private",
      function (dir) {
        try {
          var uri = dir.toURI();
          var folder = decodeURIComponent(uri.replace(/^file:\/\//, "")).replace(/\/$/, "");
          storePath = folder + "/" + STORE_FILE;
        } catch (e) {
          storePath = null;
        }
        done();
      },
      function () {
        done();
      },
      "rw"
    );
  } catch (e) {
    done();
  }
}

function reply(res, code, value, origin) {
  var headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  headers["Access-Control-Allow-Origin"] = origin && LAUNCHER_ORIGINS[origin] ? origin : "*";
  res.writeHead(code, headers);
  res.end(JSON.stringify(value));
}

function parseQuery(url) {
  var out = {};
  var q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?") + 1) : "";
  var parts = q ? q.split("&") : [];
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split("=");
    try {
      out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
    } catch (e) {
      /* ignore malformed */
    }
  }
  return out;
}

// Read-only and tracking endpoints are GET (simple requests, no preflight).
// Settings changes need a custom header, which a foreign web page cannot send without a
// preflight that we only answer for the launcher's own origin.
function handle(req, res) {
  var url = req.url || "";
  var path = url.split("?")[0];
  var query = parseQuery(url);
  var origin = req.headers && req.headers.origin;
  if (req.method === "OPTIONS") {
    if (origin && !LAUNCHER_ORIGINS[origin]) {
      reply(res, 403, { error: "forbidden" });
      return;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "X-TizenPure"
    });
    res.end();
    return;
  }
  if (req.method === "POST") {
    if ((origin && !LAUNCHER_ORIGINS[origin]) || (req.headers && req.headers[CONTROL_HEADER]) !== "1") {
      reply(res, 403, { error: "launcher only" });
      return;
    }
    if (path === "/mode" && !watcher.setMode(query.mode)) {
      reply(res, 400, { error: "bad mode" }, origin);
      return;
    }
    if (path === "/boot") {
      watcher.setOpenOnBoot(query.value === "1");
    } else if (path === "/enable") {
      watcher.enable();
    } else if (path === "/disable") {
      watcher.disable();
    } else if (path !== "/mode") {
      reply(res, 404, { error: "not found" }, origin);
      return;
    }
    reply(res, OK, watcher.status(), origin);
    return;
  }
  if (path === "/home") {
    watcher.home();
  } else if (path === "/activity") {
    watcher.activity();
  } else if (path === "/watch") {
    watcher.watch(typeof query.id === "string" ? query.id.slice(0, 64) : null);
  } else if (path === "/leave") {
    watcher.leave(typeof query.reason === "string" ? query.reason.slice(0, 40) : "leave");
  } else if (path === "/apps") {
    watcher.apps(
      (query.ids || "").split(",").filter(function (id) {
        return /^[A-Za-z0-9._-]{1,64}$/.test(id);
      })
    );
  } else if (path !== "/status") {
    reply(res, 404, { error: "not found" }, origin);
    return;
  }
  reply(res, OK, watcher.status(), origin);
}

function start() {
  if (watcher) {
    return;
  }
  resolveStore(function () {
    var persistent = !!(fs && storePath);
    watcher = core.createWatcher({
      now: function () {
        return Date.now();
      },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      appStatus: appStatus,
      tvInfo: tvInfo,
      launchSelf: launchSelf,
      load: persistent ? load : null,
      save: persistent ? save : null
    });
    server = http.createServer(function (req, res) {
      try {
        handle(req, res);
      } catch (e) {
        try {
          reply(res, 500, { error: "internal" });
        } catch (ignored) {
          /* connection already gone */
        }
      }
    });
    server.on("error", function () {
      /* port busy: another instance is serving; this one stays idle */
    });
    server.listen(CONTROL_PORT, CONTROL_HOST);
    watcher.start();
  });
}

module.exports.onStart = start;
module.exports.onRequest = start;
module.exports.onExit = function () {
  if (watcher) {
    watcher.stop();
  }
  if (server) {
    server.close();
    server = null;
  }
  watcher = null;
};
module.exports.onStop = module.exports.onExit;
module.exports._handle = function (req, res) {
  handle(req, res);
};
module.exports._setWatcher = function (w) {
  watcher = w;
};
