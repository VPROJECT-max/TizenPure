import { render } from "preact";

import { App } from "./app/App";
import { createMockPlatform } from "./platform/mock";
import { createTizenPlatform } from "./platform/tizen";
import type { KeyValueStore } from "./services/preferences";

declare const __APP_VERSION__: string;

const host = window as unknown as { tizen?: unknown; webapis?: unknown };
const platform = host.tizen ? createTizenPlatform(host.tizen, host.webapis) : createMockPlatform();

const storage = ((): KeyValueStore | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

render(<App platform={platform} storage={storage} version={__APP_VERSION__} />, document.getElementById("root") as HTMLElement);
