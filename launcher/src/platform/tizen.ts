// The real TV platform. Public-level privileges only: application.launch/info, tv.window,
// tv.inputdevice, internet (loopback only), filesystem.read/write.
import { storeIdFor } from "../shared/apps/artwork";
import { visibleApp, type RawApp } from "../shared/apps/hidden";
import type { Done, InputSource, InstalledApp, Platform } from "./types";
import { createWatcherClient } from "./watcher";

const MAIN_OPERATION = "http://tizen.org/appcontrol/operation/main";
const SETTING_OPERATION = "http://tizen.org/appcontrol/operation/setting";
const TV_VIEWER = "org.tizen.tv-viewer";
const SAMSUNG_HOME = "com.samsung.tv.csfs";
const APPS_TIMEOUT_MS = 6000;
const PLATFORM_CAPABILITY = "http://tizen.org/feature/platform.version";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const toUrl = (path: string) => (!path ? "" : path.indexOf("://") > 0 ? path : "file://" + path);

export const createTizenPlatform = (tizen: Any, webapis: Any): Platform => {
  const platformVersion = (() => {
    try {
      return parseFloat(tizen.systeminfo.getCapability(PLATFORM_CAPABILITY)) || 0;
    } catch {
      return 0;
    }
  })();
  const watcher = createWatcherClient(tizen, platformVersion);
  const nativeSources = new Map<string, unknown>();

  const launchById = (id: string, done: Done) => {
    const viaAppControl = () => {
      try {
        tizen.application.launchAppControl(
          new tizen.ApplicationControl(MAIN_OPERATION),
          id,
          () => done(true),
          (e: Any) => done(false, e && e.message),
        );
      } catch (e) {
        done(false, String((e as Error).message));
      }
    };
    try {
      tizen.application.launch(id, () => done(true), viaAppControl);
    } catch {
      viaAppControl();
    }
  };

  return {
    tv: true,
    watcher,
    listApps: () =>
      new Promise<InstalledApp[]>((resolve) => {
        let settled = false;
        const finish = (list: RawApp[]) => {
          if (settled) {
            return;
          }
          settled = true;
          const apps = list.filter(visibleApp).map((a) => {
            const id = a.id as string;
            const iconPath = a.iconPath || "";
            return { id, name: a.name || id, icon: toUrl(iconPath), storeId: storeIdFor(id, iconPath) };
          });
          // The built-in Netflix stays only when the store's Netflix isn't installed.
          const storeNetflix = apps.some((a) => /\.Netflix$/.test(a.id));
          resolve(apps.filter((a) => !(storeNetflix && a.id.indexOf("org.tizen.netflix") === 0)));
        };
        setTimeout(() => finish([]), APPS_TIMEOUT_MS);
        try {
          tizen.application.getAppsInfo(finish, () => finish([]));
        } catch {
          finish([]);
        }
      }),
    launch(app, done) {
      // Tell the watcher first so it never mistakes the new app for Samsung Home.
      const told = app.storeId ? watcher.watch(app.storeId) : watcher.leave("untracked app");
      void told.then(() => launchById(app.id, done));
    },
    listInputs: () =>
      new Promise<InputSource[]>((resolve) => {
        try {
          tizen.systeminfo.getPropertyValue(
            "VIDEOSOURCE",
            (info: Any) => {
              const out: InputSource[] = [];
              const add = (list: Any[], connected: boolean) => {
                for (const s of list || []) {
                  if (!s || s.type === "MEDIA" || typeof s.number !== "number") {
                    continue;
                  }
                  const key = s.type + s.number;
                  if (nativeSources.has(key)) {
                    continue;
                  }
                  nativeSources.set(key, s);
                  const label = s.type === "TV" ? "" : s.editName || s.type + " " + s.number;
                  out.push({ key, type: s.type, number: s.number, label, connected: connected || s.signal === true });
                }
              };
              nativeSources.clear();
              add(info && info.connected, true);
              add(info && info.disconnected, false);
              out.sort((a, b) => Number(a.type === "TV") - Number(b.type === "TV") || a.number - b.number);
              resolve(out);
            },
            () => resolve([]),
          );
        } catch {
          resolve([]);
        }
      }),
    // Input switching ported from glass-home, itself ported from Arn0 (NelsonEU/arn0-tv,
    // MIT, (c) 2026 Arnaud Etienne): set the source, then open Samsung's TV viewer so the
    // input fills the screen.
    openInput(source, done) {
      const native = nativeSources.get(source.key);
      const viewer = () => launchById(TV_VIEWER, (ok) => done(ok || !!native));
      void watcher.leave("input").then(() => {
        if (!native || !tizen.tvwindow) {
          viewer();
          return;
        }
        try {
          tizen.tvwindow.setSource(native, viewer, () => viewer(), "MAIN");
        } catch {
          viewer();
        }
      });
    },
    openTvSettings(done) {
      void watcher.leave("tv settings").then(() => {
        try {
          tizen.application.launchAppControl(
            new tizen.ApplicationControl(SETTING_OPERATION, null, null, null, []),
            null,
            () => done(true),
            () => done(false),
          );
        } catch {
          done(false);
        }
      });
    },
    openSamsungHome(done) {
      void watcher.leave("samsung home").then(() => launchById(SAMSUNG_HOME, done));
    },
    exit() {
      try {
        tizen.application.getCurrentApplication().hide();
      } catch {
        /* nothing to do */
      }
    },
    device() {
      const read = (fn: () => string) => {
        try {
          return fn() || "";
        } catch {
          return "";
        }
      };
      return {
        model: read(() => webapis.productinfo.getRealModel()) || read(() => webapis.productinfo.getModel()),
        platform: platformVersion ? String(platformVersion) : "",
        firmware: read(() => webapis.productinfo.getFirmware()),
        userAgent: navigator.userAgent,
      };
    },
    registerKeys(names) {
      for (const name of names) {
        try {
          tizen.tvinputdevice.registerKey(name);
        } catch {
          /* key not available on this remote */
        }
      }
    },
  };
};

