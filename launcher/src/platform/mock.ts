// Desktop-browser stand-in for the TV, used by `npm run dev` and the tests.
import type { InstalledApp, Platform, WatcherStatus } from "./types";

const NAMES = [
  "Netflix", "YouTube", "Prime Video", "Disney+", "HBO Max", "Apple Music", "SkyShowtime",
  "Twitch", "SmartThings", "Samsung TV Plus", "Rakuten TV", "Browser", "GeForce NOW",
  "Spotify", "Plex", "User Guide", "Workspace", "SWEET.TV",
];

export const MOCK_APPS: InstalledApp[] = NAMES.map((name, i) => ({
  id: "Mock" + String(i).padStart(6, "0") + "." + name.replace(/[^A-Za-z]/g, ""),
  name,
  icon: "",
  storeId: String(3200000000000 + i),
}));

export interface MockLog {
  launched: string[];
  watcher: string[];
}

export const createMockPlatform = (log: MockLog = { launched: [], watcher: [] }): Platform => {
  let status: WatcherStatus = { mode: "home", openOnBoot: true, disabled: null, paused: null, persistent: true };
  const w = (entry: string) => log.watcher.push(entry);
  return {
    tv: false,
    listApps: () => Promise.resolve(MOCK_APPS.slice()),
    launch(app, done) {
      w("watch " + app.storeId);
      log.launched.push(app.id);
      done(true);
    },
    listInputs: () =>
      Promise.resolve([
        { key: "HDMI1", type: "HDMI", number: 1, label: "HDMI 1", connected: true },
        { key: "HDMI2", type: "HDMI", number: 2, label: "PlayStation", connected: true },
        { key: "HDMI3", type: "HDMI", number: 3, label: "HDMI 3", connected: false },
        { key: "TV0", type: "TV", number: 0, label: "", connected: true },
      ]),
    openInput(source, done) {
      log.launched.push("input:" + source.key);
      done(true);
    },
    openTvSettings(done) {
      log.launched.push("tv-settings");
      done(true);
    },
    openSamsungHome(done) {
      log.launched.push("samsung-home");
      done(true);
    },
    exit() {
      log.launched.push("exit");
    },
    device: () => ({ model: "Browser preview", platform: "", firmware: "", userAgent: navigator.userAgent }),
    registerKeys() {},
    watcher: {
      start: () => w("start"),
      status: () => Promise.resolve(status),
      home: () => w("home"),
      activity: () => w("activity"),
      watch: (id) => Promise.resolve(w("watch " + id)).then(() => undefined),
      leave: (reason) => Promise.resolve(w("leave " + reason)).then(() => undefined),
      reportApps: (ids) => w("apps " + ids.length),
      setMode: (mode) => Promise.resolve((status = { ...status, mode })),
      setOpenOnBoot: (openOnBoot) => Promise.resolve((status = { ...status, openOnBoot })),
      enable: () => Promise.resolve((status = { ...status, disabled: null })),
    },
  };
};
