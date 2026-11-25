// The boundary between the launcher UI and the TV. `tizen.ts` implements it on the TV,
// `mock.ts` in a desktop browser and in tests.

export interface InstalledApp {
  readonly id: string; // Tizen application id
  readonly name: string;
  readonly icon: string; // file:// URL or "" (use a generated tile)
  readonly storeId: string; // id the TV's REST API knows, "" when unknown
}

export interface InputSource {
  readonly key: string; // "HDMI1", "TV"
  readonly type: "HDMI" | "TV" | string;
  readonly number: number;
  readonly label: string;
  readonly connected: boolean;
}

export interface DeviceInfo {
  readonly model: string;
  readonly platform: string; // Tizen version
  readonly firmware: string;
  readonly userAgent: string;
}

export interface WatcherStatus {
  readonly mode: "off" | "apps" | "home";
  readonly openOnBoot: boolean;
  readonly disabled: { reason: string; at: number } | null;
  readonly paused: { reason: string } | null;
  readonly persistent: boolean;
}

export type Done = (ok: boolean, detail?: string) => void;

export interface Platform {
  readonly tv: boolean;
  listApps(): Promise<InstalledApp[]>;
  launch(app: InstalledApp, done: Done): void;
  listInputs(): Promise<InputSource[]>;
  openInput(source: InputSource, done: Done): void;
  openTvSettings(done: Done): void;
  openSamsungHome(done: Done): void;
  exit(): void;
  device(): DeviceInfo;
  registerKeys(names: readonly string[]): void;
  watcher: WatcherClient;
}

export interface WatcherClient {
  start(): void;
  status(): Promise<WatcherStatus | null>;
  home(): void;
  activity(): void;
  // Resolve once the watcher acknowledged (or after a short timeout): open the app after.
  watch(storeId: string): Promise<void>;
  leave(reason: string): Promise<void>;
  reportApps(storeIds: readonly string[]): void;
  setMode(mode: WatcherStatus["mode"]): Promise<WatcherStatus | null>;
  setOpenOnBoot(value: boolean): Promise<WatcherStatus | null>;
  enable(): Promise<WatcherStatus | null>;
}
