// Client for the TizenPure watcher service on http://127.0.0.1:47391.
// Startup follows AeroTizen's proven order (MIT): AppControl first; on Tizen 9+ fall back to
// the `wrt:service` module if the service hasn't answered after 1.5 s; give a cold boot
// up to 30 s.
import type { WatcherClient, WatcherStatus } from "./types";

export const WATCHER_URL = "http://127.0.0.1:47391";
export const SERVICE_ID = "TizenPure0.Watcher";
const SERVICE_OPERATION = "http://tizen.org/appcontrol/operation/service";
const REQUEST_TIMEOUT_MS = 1500;
const READY_POLL_MS = 400;
const START_DEADLINE_MS = 30000;
const WRT_FALLBACK_MS = 1500;
const WRT_PLATFORM = 9;
const ACTIVITY_THROTTLE_MS = 2000;
const HANDOFF_WAIT_MS = 500;
const WRT_EVENT = "tizenpure-wrt-service";
const RESTART_WAIT_MS = 1500;
declare const __SERVICE_BUILD__: string;
const WRT_SOURCE =
  "import { Service } from 'wrt:service'; window.dispatchEvent(new CustomEvent('" + WRT_EVENT + "', { detail: Service }));";

interface TizenLike {
  application: {
    launchAppControl(control: unknown, id: string | null, ok: () => void, failed: () => void): void;
  };
  ApplicationControl: new (operation: string) => unknown;
}

const request = (method: "GET" | "POST", path: string): Promise<WatcherStatus | null> =>
  new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, WATCHER_URL + path);
      xhr.timeout = REQUEST_TIMEOUT_MS;
      if (method === "POST") {
        xhr.setRequestHeader("X-TizenPure", "1");
      }
      xhr.onload = () => {
        try {
          resolve(xhr.status === 200 ? (JSON.parse(xhr.responseText) as WatcherStatus) : null);
        } catch {
          resolve(null);
        }
      };
      xhr.onerror = xhr.ontimeout = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });

export const createWatcherClient = (tizen: TizenLike | null, platformVersion: number): WatcherClient => {
  let ready = false;
  let starting = false;
  let inventory: readonly string[] = [];
  let lastActivity = 0;

  const fire = (path: string) => {
    void request("GET", path).then((reply) => {
      if (!reply && !starting) {
        start();
      }
    });
  };
  // Tell the watcher, then let the caller continue: on reply, or after HANDOFF_WAIT_MS.
  const handoff = (path: string) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, HANDOFF_WAIT_MS);
      void request("GET", path).then((reply) => {
        clearTimeout(timer);
        if (!reply && !starting) {
          start();
        }
        resolve();
      });
    });
  const startWrt = () => {
    try {
      const onService = (event: Event) => {
        window.removeEventListener(WRT_EVENT, onService);
        try {
          const Service = (event as CustomEvent).detail as new (id: string) => { start(): unknown };
          void new Service(SERVICE_ID).start();
        } catch {
          /* AppControl remains the primary path */
        }
      };
      window.addEventListener(WRT_EVENT, onService);
      const script = document.createElement("script");
      script.type = "module";
      script.textContent = WRT_SOURCE;
      document.body.appendChild(script);
    } catch {
      /* not available on this firmware */
    }
  };
  const start = () => {
    if (!tizen || starting) {
      return;
    }
    starting = true;
    const since = Date.now();
    let wrtTried = false;
    try {
      tizen.application.launchAppControl(new tizen.ApplicationControl(SERVICE_OPERATION), SERVICE_ID, () => {}, () => {});
    } catch {
      /* fall through to polling and the wrt fallback */
    }
    let restarted = false;
    const poll = () => {
      void request("GET", "/status").then((reply) => {
        const build = reply ? (reply as unknown as { build?: string }).build : undefined;
        if (reply && !restarted && __SERVICE_BUILD__ !== "dev" && build !== __SERVICE_BUILD__) {
          // An older watcher survived an update: ask it to exit, then start the new one.
          restarted = true;
          void request("POST", "/exit").then(() =>
            setTimeout(() => {
              try {
                if (tizen) tizen.application.launchAppControl(new tizen.ApplicationControl(SERVICE_OPERATION), SERVICE_ID, () => {}, () => {});
              } catch {
                /* the poll below keeps trying */
              }
              poll();
            }, RESTART_WAIT_MS),
          );
          return;
        }
        if (reply) {
          ready = true;
          starting = false;
          if (inventory.length) {
            fire("/apps?ids=" + inventory.map(encodeURIComponent).join(","));
          }
          fire("/home");
          return;
        }
        if (!wrtTried && platformVersion >= WRT_PLATFORM && Date.now() - since >= WRT_FALLBACK_MS) {
          wrtTried = true;
          startWrt();
        }
        if (Date.now() - since < START_DEADLINE_MS) {
          setTimeout(poll, READY_POLL_MS);
        } else {
          starting = false;
        }
      });
    };
    poll();
  };

  return {
    start,
    status: () => request("GET", "/status"),
    home: () => fire("/home"),
    activity: () => {
      const now = Date.now();
      if (ready && now - lastActivity > ACTIVITY_THROTTLE_MS) {
        lastActivity = now;
        fire("/activity");
      }
    },
    watch: (storeId) => handoff("/watch?id=" + encodeURIComponent(storeId)),
    leave: (reason) => handoff("/leave?reason=" + encodeURIComponent(reason)),
    reportApps: (ids) => {
      inventory = ids;
      fire("/apps?ids=" + ids.map(encodeURIComponent).join(","));
    },
    setMode: (mode) => request("POST", "/mode?mode=" + mode),
    setOpenOnBoot: (value) => request("POST", "/boot?value=" + (value ? "1" : "0")),
    enable: () => request("POST", "/enable"),
  };
};
