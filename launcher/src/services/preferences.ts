// User settings, stored in localStorage under a versioned key. Every field is validated:
// anything unknown or invalid falls back to its default (no silent migrations).

export const SETTINGS_KEY = "tizenpure.settings.v1";

export const ACCENTS = {
  blue: "#3d8bff",
  mint: "#2fd6a0",
  violet: "#9b7bff",
  rose: "#ff5c8a",
  amber: "#f5b942",
  sky: "#4cc9f0",
} as const;

export const WALLPAPERS = ["dusk", "aurora", "ink", "lake", "forest", "alps", "solid"] as const;
export const LANGUAGES = ["auto", "en", "ro", "de", "fr", "es"] as const;

export interface Settings {
  readonly version: 1;
  readonly theme: "auto" | "dark" | "light";
  readonly accent: keyof typeof ACCENTS;
  readonly wallpaper: (typeof WALLPAPERS)[number];
  readonly dim: number; // wallpaper dimming 0..60 (%)
  readonly effects: "auto" | "full" | "reduced" | "flat";
  readonly iconSize: "s" | "m" | "l";
  readonly columns: 5 | 6 | 7;
  readonly rows: 2 | 3;
  readonly clock: "24h" | "12h" | "off";
  readonly clockSize: "large" | "compact";
  readonly labels: boolean;
  readonly language: (typeof LANGUAGES)[number];
  readonly motion: "auto" | "reduced";
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: "dark",
  accent: "blue",
  wallpaper: "dusk",
  dim: 20,
  effects: "auto",
  iconSize: "m",
  columns: 6,
  rows: 2,
  clock: "24h",
  clockSize: "large",
  labels: true,
  language: "auto",
  motion: "auto",
};

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.indexOf(value as T) >= 0 ? (value as T) : fallback;

export const normalizeSettings = (input: unknown): Settings => {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (v.version !== 1) {
    return DEFAULT_SETTINGS;
  }
  const d = DEFAULT_SETTINGS;
  const dim = typeof v.dim === "number" && isFinite(v.dim) ? Math.round(v.dim) : d.dim;
  return {
    version: 1,
    theme: oneOf(v.theme, ["auto", "dark", "light"] as const, d.theme),
    accent: oneOf(v.accent, Object.keys(ACCENTS) as (keyof typeof ACCENTS)[], d.accent),
    wallpaper: oneOf(v.wallpaper, WALLPAPERS, d.wallpaper),
    dim: dim >= 0 && dim <= 60 ? dim : d.dim,
    effects: oneOf(v.effects, ["auto", "full", "reduced", "flat"] as const, d.effects),
    iconSize: oneOf(v.iconSize, ["s", "m", "l"] as const, d.iconSize),
    columns: oneOf(v.columns, [5, 6, 7] as const, d.columns),
    rows: oneOf(v.rows, [2, 3] as const, d.rows),
    clock: oneOf(v.clock, ["24h", "12h", "off"] as const, d.clock),
    clockSize: oneOf(v.clockSize, ["large", "compact"] as const, d.clockSize),
    labels: typeof v.labels === "boolean" ? v.labels : d.labels,
    language: oneOf(v.language, LANGUAGES, d.language),
    motion: oneOf(v.motion, ["auto", "reduced"] as const, d.motion),
  };
};

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const loadJson = (store: KeyValueStore | null, key: string): unknown => {
  try {
    const text = store && store.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const saveJson = (store: KeyValueStore | null, key: string, value: unknown): boolean => {
  try {
    if (!store) {
      return false;
    }
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
