import { describe, expect, it } from "vitest";

import { engineVersion } from "../../launcher/src/app/App";
import { formatTime } from "../../launcher/src/home/Clock";
import { createTranslate, resolveLanguage } from "../../launcher/src/i18n";
import { artworkSources, storeIdFor } from "../../launcher/src/shared/apps/artwork";
import { visibleApp } from "../../launcher/src/shared/apps/hidden";
import { clampFocus, move } from "../../launcher/src/shared/navigation";
import { tierFromFrames } from "../../launcher/src/shared/perf";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../launcher/src/services/preferences";

describe("settings", () => {
  it("falls back to defaults for unknown versions and invalid values", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ version: 9, theme: "light" })).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ version: 1, theme: "light", columns: 9, dim: 400, accent: "mint", labels: "yes" });
    expect(s.theme).toBe("light");
    expect(s.columns).toBe(DEFAULT_SETTINGS.columns);
    expect(s.dim).toBe(DEFAULT_SETTINGS.dim);
    expect(s.accent).toBe("mint");
    expect(s.labels).toBe(true);
  });
});

describe("navigation", () => {
  const shape = { pageSizes: [12, 5], columns: 6, dockSize: 4 };
  it("moves across pages at the grid edge", () => {
    expect(move({ zone: "grid", page: 0, index: 5 }, "right", shape)).toEqual({ zone: "grid", page: 1, index: 0 });
    expect(move({ zone: "grid", page: 1, index: 0 }, "left", shape)).toEqual({ zone: "grid", page: 0, index: 5 });
  });
  it("goes down into the dock and back up", () => {
    const dock = move({ zone: "grid", page: 0, index: 11 }, "down", shape);
    expect(dock).toEqual({ zone: "dock", page: 0, index: 3 });
    expect(move(dock as never, "up", shape)).toEqual({ zone: "grid", page: 0, index: 11 });
  });
  it("Up from the first row opens the Control Center", () => {
    expect(move({ zone: "grid", page: 0, index: 2 }, "up", shape)).toBe("top");
  });
  it("clamps focus when the layout shrinks", () => {
    expect(clampFocus({ zone: "grid", page: 3, index: 40 }, shape)).toEqual({ zone: "grid", page: 1, index: 4 });
    expect(clampFocus({ zone: "dock", page: 0, index: 9 }, { ...shape, dockSize: 0 })).toEqual({ zone: "grid", page: 0, index: 0 });
  });
});

describe("apps", () => {
  it("hides Samsung system pieces and ourselves, keeps real apps", () => {
    expect(visibleApp({ id: "com.samsung.tv.csfs", name: "Home" })).toBe(false);
    expect(visibleApp({ id: "TizenPure0.Home", name: "TizenPure" })).toBe(false);
    expect(visibleApp({ id: "org.tizen.netflix-app", name: "Netflix" })).toBe(true);
    expect(visibleApp({ id: "com.samsung.tv.SmartThingsApp", name: "SmartThings" })).toBe(true);
    expect(visibleApp({ id: "9Ur5IzDKqV.TizenYouTube", name: "YouTube" })).toBe(true);
    expect(visibleApp({ id: "x.y", name: "Hidden", show: false })).toBe(false);
    expect(visibleApp({ id: "org.tizen.apple.apple-music-dummy", name: "Apple Music" })).toBe(false);
    expect(visibleApp({ id: "org.tizen.apple.apple-music", name: "Apple Music" })).toBe(true);
    expect(visibleApp({ id: "com.samsung.tv.store", name: "Apps" })).toBe(true);
  });
  it("maps preloaded apps to the store id the TV's API knows", () => {
    expect(storeIdFor("org.tizen.netflix-app")).toBe("3201907018807");
    expect(storeIdFor("org.tizen.primevideo")).toBe("3201910019365");
    expect(storeIdFor("MCmYXNxgcu.DisneyPlus")).toBe("3201901017640");
    expect(storeIdFor("AbCdEfGhIj.SomeApp")).toBe("AbCdEfGhIj.SomeApp");
    expect(storeIdFor("x.y", "/opt/share/webappservice/apps_icon/all/3202311033054/")).toBe("3202311033054");
    expect(storeIdFor("org.tizen.unknown")).toBe("");
  });
  it("artwork: TV icon cache first, then the package icon, nothing off-device", () => {
    const sources = artworkSources({ id: "a.b", icon: "/opt/usr/apps/a/icon.png", storeId: "3201907018807" }, true);
    expect(sources[0]).toBe("file:///opt/share/webappservice/apps_icon/all/3201907018807/304x304.png");
    expect(sources[sources.length - 1]).toBe("file:///opt/usr/apps/a/icon.png");
    expect(sources.every((s) => s.indexOf("file://") === 0)).toBe(true);
    expect(artworkSources({ id: "a.b", icon: "", storeId: "3201907018807" }, false)).toEqual([]);
  });
});

describe("about", () => {
  it("reads the engine from Tizen 9 and desktop user agents", () => {
    const tizen9 = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) 120.0.6099.5/9.0 TV Safari/537.36";
    expect(engineVersion(tizen9)).toBe("Chromium 120");
    expect(engineVersion("Mozilla/5.0 Chrome/63.0.3239.84 Safari/537.36")).toBe("Chromium 63");
  });
});

describe("performance tiers", () => {
  it("drops blur on slow frames and low memory", () => {
    expect(tierFromFrames(Array(30).fill(16))).toBe("full");
    expect(tierFromFrames(Array(30).fill(22))).toBe("reduced");
    expect(tierFromFrames(Array(30).fill(33))).toBe("flat");
    expect(tierFromFrames(Array(30).fill(16), 1)).toBe("reduced");
    expect(tierFromFrames([], 1)).toBe("flat");
  });
});

describe("i18n and clock", () => {
  it("resolves languages and falls back to English", () => {
    expect(resolveLanguage("auto", "ro-RO")).toBe("ro");
    expect(resolveLanguage("auto", "ja-JP")).toBe("en");
    expect(createTranslate("de")("settings.recovery")).toMatch(/Home twice/);
    expect(createTranslate("ro")("app.openFailed", { name: "X" })).toContain("X");
  });
  it("formats 12 and 24 hour clocks", () => {
    const d = new Date(2026, 0, 1, 15, 4);
    expect(formatTime(d, "24h")).toBe("15:04");
    expect(formatTime(d, "12h")).toBe("3:04");
  });
});
