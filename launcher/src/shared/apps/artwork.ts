// Artwork chain: the TV's own icon cache -> the app's package icon -> a generated tile
// (Lucide glyph on a gradient). No network is ever used for artwork.
import storeIds from "./storeIds.json";

const ICON_CACHE_ROOT = "/opt/share/webappservice/apps_icon/";
const ICON_CACHE_PATH = /\/opt\/share\/webappservice\/apps_icon\/(?:all|FirstScreen)\/(\d+)\//;
const STORE_ID = /^\d{6,}$/;
const CACHE_CANDIDATES = [
  ["all", 304],
  ["FirstScreen", 250],
] as const;
// Some packages report Tizen's generic pinwheel or a broken icon; use a tile instead.
const NO_PACKAGE_ICON = /^(9Ur5IzDKqV\.TizenYouTube|org\.tizen\.primevideo|com\.samsung\.tv\.tvplus)$/;

const KNOWN: Readonly<Record<string, string>> = storeIds;

export const storeIdFor = (id: string, iconPath = ""): string => {
  if (KNOWN[id]) {
    return KNOWN[id];
  }
  const cached = iconPath.match(ICON_CACHE_PATH);
  if (cached) {
    return cached[1];
  }
  if (STORE_ID.test(id)) {
    return id;
  }
  // Store apps (10-char package) are answered by the REST API under their Tizen id.
  return /^[A-Za-z0-9]{10}\./.test(id) ? id : "";
};

const toUrl = (path: string) => (/^(file|https?|data):/i.test(path) ? path : path.charAt(0) === "/" ? "file://" + path : path);

export const artworkSources = (app: { id: string; icon: string; storeId: string }, tv: boolean): string[] => {
  const sources: string[] = [];
  const numeric = STORE_ID.test(app.storeId) ? app.storeId : (app.icon.match(ICON_CACHE_PATH) || [])[1];
  if (tv && numeric) {
    for (const [dir, size] of CACHE_CANDIDATES) {
      sources.push("file://" + ICON_CACHE_ROOT + dir + "/" + numeric + "/" + size + "x" + size + ".png");
    }
  }
  if (app.icon && !NO_PACKAGE_ICON.test(app.id) && !ICON_CACHE_PATH.test(app.icon)) {
    sources.push(toUrl(app.icon));
  }
  return sources;
};

// Deterministic tile look for apps without artwork.
const GLYPHS: readonly [RegExp, string][] = [
  [/music|spotify|deezer|tidal|radio|podcast/i, "audio-lines"],
  [/game|geforce|xbox|steam|play(station)?|strike|arcade/i, "gamepad-2"],
  [/tv plus|live|antena|digi|focus|canal|sweet|megogo|voyo|iptv/i, "tv"],
  [/browser|internet|web/i, "globe"],
  [/smartthings|home|workspace/i, "layout-grid"],
  [/photo|gallery|art/i, "image"],
  [/guide|manual|help|ghid/i, "circle-question-mark"],
  [/security|shield/i, "shield-check"],
];

export const tileGlyph = (name: string): string => {
  for (const [pattern, glyph] of GLYPHS) {
    if (pattern.test(name)) {
      return glyph;
    }
  }
  return "clapperboard";
};

export const tileHue = (name: string): number => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
};

export const monogram = (name: string): string => {
  // No Unicode property escapes: they need Chromium 64, the floor is 63.
  const words = name
    .replace(/[^0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ ]/g, " ")
    .trim()
    .split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
};
