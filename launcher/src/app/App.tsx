import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { HomeView } from "../home/HomeView";
import { createTranslate, LANGUAGE_NAMES, resolveLanguage, type Translate } from "../i18n";
import {
  ActionSheet,
  ControlCenter,
  FolderView,
  inputTiles,
  type PanelTile,
  type SettingsRow,
  SettingsPanel,
  type SheetAction,
  Toast,
} from "../panels/Panels";
import type { InputSource, InstalledApp, Platform, WatcherStatus } from "../platform/types";
import {
  EMPTY_LAYOUT,
  gridItems,
  groupInto,
  isFolder,
  type Item,
  itemId,
  LAYOUT_KEY,
  type Layout,
  moveInDock,
  moveItem,
  normalizeLayout,
  paginate,
  reconcile,
  removeFromFolder,
  setHidden,
  toggleDock,
} from "../services/layout";
import {
  ACCENTS,
  type KeyValueStore,
  LANGUAGES,
  loadJson,
  normalizeSettings,
  saveJson,
  SETTINGS_KEY,
  type Settings,
  WALLPAPERS,
} from "../services/preferences";
import { clampFocus, type Direction, type HomeFocus, move, step } from "../shared/navigation";
import { probeFrames, supportsBackdrop, type Tier, tierFromFrames } from "../shared/perf";
import { type Key, keyOf, LONG_PRESS_MS, REGISTERED_KEYS } from "./keys";

type Target = { kind: "app"; id: string; folderId?: string } | { kind: "folder"; id: string };
type Overlay =
  | null
  | { type: "actions"; target: Target; index: number }
  | { type: "folder"; folderId: string; index: number }
  | { type: "control"; index: number }
  | { type: "settings"; index: number; confirmReset?: boolean };
type Edit = null | { kind: "jiggle" } | { kind: "move" } | { kind: "pick"; appId: string };

interface Props {
  readonly platform: Platform;
  readonly storage: KeyValueStore | null;
  readonly version: string;
}

const TOAST_MS = 2600;
const DIRS: Partial<Record<Key, Direction>> = { up: "up", down: "down", left: "left", right: "right" };

const cycle = <T,>(values: readonly T[], current: T, delta: number): T =>
  values[(values.indexOf(current) + delta + values.length * 4) % values.length];

const perPage = (s: Settings) => s.columns * s.rows;
// Tizen 9 user agents carry the engine as "120.0.6099.5/9.0" with no "Chrome/" token.
export const engineVersion = (ua: string) => {
  const match = ua.match(/Chrome\/(\d+)/) || ua.match(/\) (\d{2,3})\.\d+\.\d+\.\d+\//);
  return match ? "Chromium " + match[1] : "-";
};
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const App = ({ platform, storage, version }: Props) => {
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings(loadJson(storage, SETTINGS_KEY)));
  const [layout, setLayout] = useState<Layout>(() => normalizeLayout(loadJson(storage, LAYOUT_KEY)));
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [inputs, setInputs] = useState<InputSource[]>([]);
  const [focus, setFocus] = useState<HomeFocus>({ zone: "grid", page: 0, index: 0 });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [probedTier, setProbedTier] = useState<Tier>("reduced");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);
  const okTimer = useRef(0);
  const okLong = useRef(false);
  const loaded = useRef(false);

  const lang = resolveLanguage(settings.language, navigator.language);
  const t: Translate = useMemo(() => createTranslate(lang), [lang]);
  const appMap = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const pages = useMemo(() => paginate(gridItems(layout), perPage(settings)), [layout, settings]);
  const dock = useMemo(
    () => layout.dock.map((id) => appMap.get(id)).filter((a): a is InstalledApp => !!a),
    [layout, appMap],
  );
  const shape = { pageSizes: pages.map((p) => p.length), columns: settings.columns, dockSize: dock.length };

  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  // -- persistence -----------------------------------------------------------
  useEffect(() => void saveJson(storage, SETTINGS_KEY, settings), [settings, storage]);
  useEffect(() => {
    if (loaded.current) {
      saveJson(storage, LAYOUT_KEY, layout);
    }
  }, [layout, storage]);

  // -- loading apps, inputs and watcher state ----------------------------------
  const refresh = useCallback(() => {
    void platform.listApps().then((list) => {
      setApps(list);
      setLayout((current) => reconcile(current, list));
      loaded.current = true;
      platform.watcher.reportApps(list.map((a) => a.storeId).filter(Boolean));
    });
    void platform.listInputs().then(setInputs);
    void platform.watcher.status().then(setWatcher);
  }, [platform]);

  useEffect(() => {
    platform.registerKeys(REGISTERED_KEYS);
    platform.watcher.start();
    platform.watcher.home();
    refresh();
    const onVisible = () => {
      if (!document.hidden) {
        platform.watcher.home();
        setOverlay(null);
        setEdit(null);
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    if (supportsBackdrop()) {
      probeFrames((frames) => {
        const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
        setProbedTier(tierFromFrames(frames, memory));
      });
    } else {
      setProbedTier("flat");
    }
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [platform, refresh]);

  useEffect(() => setFocus((f) => clampFocus(f, shape)), [pages.length, dock.length, settings.columns, settings.rows]);

  // -- derived look ----------------------------------------------------------
  const tier: Tier = settings.effects === "auto" ? probedTier : settings.effects;
  const hour = new Date().getHours();
  const theme = settings.theme === "auto" ? (hour >= 7 && hour < 19 ? "light" : "dark") : settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.className =
      "theme-" + theme + " tier-" + tier + (settings.motion === "reduced" ? " motion-reduced" : "");
    root.style.setProperty("--accent", ACCENTS[settings.accent]);
    root.style.setProperty("--dim", String(settings.dim / 100));
    root.setAttribute("data-wallpaper", settings.wallpaper);
    root.setAttribute("lang", lang);
  }, [theme, tier, settings, lang]);

  // -- focused things ------------------------------------------------------------
  const focusedItem = (): Item | null =>
    focus.zone === "grid" ? (pages[focus.page] || [])[focus.index] || null : layout.dock[focus.index] || null;
  const visibleIndex = () => focus.page * perPage(settings) + focus.index;
  const folderApps = (folderId: string) => {
    const folder = layout.order.find((i) => isFolder(i) && i.folder === folderId);
    return folder && isFolder(folder)
      ? folder.apps.filter((id) => layout.hidden.indexOf(id) < 0).map((id) => appMap.get(id)).filter((a): a is InstalledApp => !!a)
      : [];
  };

  const launch = (app: InstalledApp) =>
    platform.launch(app, (ok) => {
      if (!ok) {
        notify(t("app.openFailed", { name: app.name }));
      }
    });

  const actionsFor = (target: Target): SheetAction[] => {
    if (target.kind === "folder") {
      return [
        { id: "open", label: t("app.open"), icon: "folder-open" },
        { id: "move", label: t("app.move"), icon: "move" },
        { id: "edit", label: t("app.edit"), icon: "pencil" },
      ];
    }
    const inDock = layout.dock.indexOf(target.id) >= 0;
    const list: SheetAction[] = [{ id: "open", label: t("app.open"), icon: "play" }];
    if (!target.folderId) {
      list.push({ id: "move", label: t("app.move"), icon: "move" });
    }
    list.push({ id: "dock", label: inDock ? t("app.removeDock") : t("app.addDock"), icon: "layers" });
    if (target.folderId) {
      list.push({ id: "unfolder", label: t("app.removeFolder"), icon: "log-out" });
    } else if (!inDock) {
      list.push({ id: "folder", label: t("app.folder"), icon: "folder" });
    }
    list.push({ id: "hide", label: t("app.hide"), icon: "eye-off", danger: true });
    if (!edit) {
      list.push({ id: "edit", label: t("app.edit"), icon: "pencil" });
    }
    return list;
  };

  const runAction = (target: Target, id: string) => {
    setOverlay(null);
    if (id === "open") {
      if (target.kind === "folder") {
        setOverlay({ type: "folder", folderId: target.id, index: 0 });
      } else {
        const app = appMap.get(target.id);
        if (app) {
          launch(app);
        }
      }
    } else if (id === "move") {
      setEdit({ kind: "move" });
    } else if (id === "edit") {
      setEdit({ kind: "jiggle" });
    } else if (id === "dock" && target.kind === "app") {
      setLayout((l) => toggleDock(l, target.id));
    } else if (id === "hide" && target.kind === "app") {
      setLayout((l) => setHidden(l, target.id, true));
    } else if (id === "folder" && target.kind === "app") {
      setEdit({ kind: "pick", appId: target.id });
    } else if (id === "unfolder" && target.kind === "app" && target.folderId) {
      setLayout((l) => removeFromFolder(l, target.folderId as string, target.id));
    }
  };

  const openTarget = (item: Item, inFolder?: string): Target =>
    isFolder(item) ? { kind: "folder", id: item.folder } : { kind: "app", id: item, folderId: inFolder };

  // -- Control Center ----------------------------------------------------------
  const shortcuts: PanelTile[] = [
    { id: "samsung-home", label: t("panel.samsungHome"), icon: "house" },
    { id: "tv-settings", label: t("panel.tvSettings"), icon: "settings" },
    { id: "settings", label: t("panel.settings"), icon: "sliders-horizontal" },
    { id: "edit", label: t("panel.edit"), icon: "pencil" },
    { id: "theme", label: t("panel.theme"), icon: "sun-moon" },
  ];
  const ccTiles = [...inputTiles(t, inputs), ...shortcuts];
  const runTile = (id: string) => {
    setOverlay(null);
    if (id.indexOf("input:") === 0) {
      const source = inputs.find((s) => "input:" + s.key === id);
      if (source) {
        platform.openInput(source, (ok) => !ok && notify(t("app.openFailed", { name: source.label || "TV" })));
      }
    } else if (id === "samsung-home") {
      platform.openSamsungHome(() => {});
    } else if (id === "tv-settings") {
      platform.openTvSettings((ok) => !ok && notify(t("app.openFailed", { name: t("panel.tvSettings") })));
    } else if (id === "settings") {
      setOverlay({ type: "settings", index: 0 });
    } else if (id === "edit") {
      setEdit({ kind: "jiggle" });
    } else if (id === "theme") {
      setSettings((s) => ({ ...s, theme: theme === "dark" ? "light" : "dark" }));
    }
  };

  // -- Settings rows -------------------------------------------------------------
  interface Row extends SettingsRow {
    change?: (delta: number) => void;
    activate?: () => void;
  }
  const set = <K extends keyof Settings>(key: K, values: readonly Settings[K][]) => (delta: number) =>
    setSettings((s) => ({ ...s, [key]: cycle(values, s[key], delta) }));
  const watcherState = !watcher
    ? t("watcher.unavailable")
    : watcher.disabled
      ? t("watcher.disabled", { reason: watcher.disabled.reason })
      : watcher.mode === "off"
        ? t("watcher.offMode")
        : watcher.paused
          ? t("watcher.paused")
          : t("watcher.active");
  const modes: WatcherStatus["mode"][] = ["home", "apps", "off"];
  const modeLabel = { home: t("value.modeHome"), apps: t("value.modeApps"), off: t("value.modeOff") };
  const hiddenApps = layout.hidden.map((id) => appMap.get(id)).filter((a): a is InstalledApp => !!a);
  const device = platform.device();
  const rows: Row[] = [
    { id: "theme", section: t("settings.appearance"), label: t("settings.theme"), kind: "choice", value: t(("value." + settings.theme) as "value.auto"), change: set("theme", ["dark", "light", "auto"]) },
    { id: "accent", label: t("settings.accent"), kind: "choice", value: title(settings.accent), swatch: ACCENTS[settings.accent], change: set("accent", Object.keys(ACCENTS) as Settings["accent"][]) },
    { id: "wallpaper", label: t("settings.wallpaper"), kind: "choice", value: title(settings.wallpaper), change: set("wallpaper", WALLPAPERS) },
    { id: "dim", label: t("settings.dim"), kind: "choice", value: settings.dim + "%", change: (d) => setSettings((s) => ({ ...s, dim: Math.max(0, Math.min(60, s.dim + d * 10)) })) },
    { id: "effects", label: t("settings.effects"), kind: "choice", value: settings.effects === "auto" ? t("value.auto") + " (" + t(("value." + probedTier) as "value.full") + ")" : t(("value." + settings.effects) as "value.full"), change: set("effects", ["auto", "full", "reduced", "flat"]) },
    { id: "motion", label: t("settings.motion"), kind: "choice", value: settings.motion === "auto" ? t("value.auto") : t("value.reduced"), change: set("motion", ["auto", "reduced"]) },
    { id: "clock", label: t("settings.clock"), kind: "choice", value: t(("value." + settings.clock) as "value.on"), change: set("clock", ["24h", "12h", "off"]) },
    { id: "clockSize", label: t("settings.clockSize"), kind: "choice", value: t(("value." + settings.clockSize) as "value.large"), change: set("clockSize", ["large", "compact"]) },
    { id: "language", label: t("settings.language"), kind: "choice", value: settings.language === "auto" ? t("value.auto") : LANGUAGE_NAMES[settings.language], change: set("language", LANGUAGES) },
    { id: "iconSize", section: t("settings.layout"), label: t("settings.iconSize"), kind: "choice", value: t(("value." + settings.iconSize) as "value.s"), change: set("iconSize", ["s", "m", "l"]) },
    { id: "columns", label: t("settings.columns"), kind: "choice", value: String(settings.columns), change: set("columns", [5, 6, 7]) },
    { id: "rows", label: t("settings.rows"), kind: "choice", value: String(settings.rows), change: set("rows", [2, 3]) },
    { id: "labels", label: t("settings.labels"), kind: "choice", value: settings.labels ? t("value.on") : t("value.off"), change: () => setSettings((s) => ({ ...s, labels: !s.labels })) },
    { id: "reset", label: overlay && overlay.type === "settings" && overlay.confirmReset ? t("confirm.reset") : t("settings.resetLayout"), kind: "action", activate: () => {
      if (overlay && overlay.type === "settings" && overlay.confirmReset) {
        setLayout(reconcile(EMPTY_LAYOUT, apps));
        setOverlay({ ...overlay, confirmReset: false });
        notify(t("toast.saved"));
      } else if (overlay && overlay.type === "settings") {
        setOverlay({ ...overlay, confirmReset: true });
      }
    } },
    { id: "watcherMode", section: t("settings.homeButton"), label: t("settings.watcherMode"), kind: "choice", value: modeLabel[watcher ? watcher.mode : "home"], change: (d) => {
      const next = cycle(modes, watcher ? watcher.mode : "home", d);
      void platform.watcher.setMode(next).then((s) => s && setWatcher(s));
    } },
    { id: "openOnBoot", label: t("settings.openOnBoot"), kind: "choice", value: watcher && !watcher.openOnBoot ? t("value.off") : t("value.on"), change: () => void platform.watcher.setOpenOnBoot(!(watcher && watcher.openOnBoot)).then((s) => s && setWatcher(s)) },
    { id: "watcherState", label: t("settings.watcherState"), kind: "info", value: watcherState },
    ...(watcher && watcher.disabled ? [{ id: "reenable", label: t("settings.reenable"), kind: "action" as const, activate: () => void platform.watcher.enable().then((s) => s && setWatcher(s)) }] : []),
    { id: "recovery", label: t("settings.recovery"), kind: "info" },
    ...(hiddenApps.length
      ? hiddenApps.map((app, i) => ({ id: "unhide:" + app.id, section: i === 0 ? t("settings.apps") : undefined, label: app.name, kind: "action" as const, value: t("settings.unhide"), activate: () => setLayout((l) => setHidden(l, app.id, false)) }))
      : [{ id: "nohidden", section: t("settings.apps"), label: t("settings.noHidden"), kind: "info" as const }]),
    { id: "version", section: t("settings.about"), label: t("about.version"), kind: "info", value: version },
    { id: "tv", label: t("about.tv"), kind: "info", value: [device.model, device.platform && "Tizen " + device.platform, device.firmware].filter(Boolean).join("  ") || "-" },
    { id: "engine", label: t("about.engine"), kind: "info", value: engineVersion(device.userAgent) },
    { id: "credits", label: t("about.credits"), kind: "info" },
  ];

  // -- key handling -----------------------------------------------------------------
  const onHomeKey = (key: Key, long: boolean) => {
    const dir = DIRS[key];
    if (edit && edit.kind === "move" && dir) {
      if (focus.zone === "dock") {
        const to = step(focus.index, dir === "left" ? -1 : dir === "right" ? 1 : 0, dock.length);
        setLayout((l) => moveInDock(l, focus.index, to));
        setFocus({ ...focus, index: to });
        return;
      }
      const from = visibleIndex();
      const next = move(focus, dir, shape);
      if (next === "top" || next.zone !== "grid") {
        return;
      }
      const to = next.page * perPage(settings) + next.index;
      setLayout((l) => moveItem(l, from, to));
      setFocus(next);
      return;
    }
    if (dir) {
      const next = move(focus, dir, shape);
      if (next === "top") {
        if (!edit) {
          setOverlay({ type: "control", index: 0 });
        }
      } else {
        setFocus(next);
      }
      return;
    }
    if (key === "back") {
      if (edit) {
        setEdit(edit.kind === "jiggle" ? null : { kind: "jiggle" });
      } else if (focus.page !== 0 || focus.zone !== "grid" || focus.index !== 0) {
        setFocus({ zone: "grid", page: 0, index: 0 });
      }
      return;
    }
    if (key === "red" || key === "yellow") {
      setOverlay({ type: "control", index: 0 });
      return;
    }
    if (key === "blue" || key === "info") {
      setOverlay({ type: "settings", index: 0 });
      return;
    }
    const item = focusedItem();
    if (!item) {
      if (key === "menu" || long) {
        setOverlay({ type: "control", index: 0 });
      }
      return;
    }
    if (key === "ok" && edit && edit.kind === "move") {
      setEdit({ kind: "jiggle" });
      return;
    }
    if (key === "ok" && edit && edit.kind === "pick") {
      if (focus.zone === "grid" && itemId(item) !== edit.appId) {
        const n = layout.order.filter(isFolder).length + 1;
        setLayout((l) => groupInto(l, edit.appId, item, "f" + Date.now().toString(36), t("folder.default") + " " + n));
      }
      setEdit({ kind: "jiggle" });
      return;
    }
    if (key === "menu" || long || (key === "ok" && edit)) {
      setOverlay({ type: "actions", target: openTarget(item), index: 0 });
      return;
    }
    if (key === "ok") {
      if (isFolder(item)) {
        setOverlay({ type: "folder", folderId: item.folder, index: 0 });
      } else {
        const app = appMap.get(item);
        if (app) {
          launch(app);
        }
      }
    }
  };

  const onOverlayKey = (key: Key, long: boolean) => {
    if (!overlay) {
      return;
    }
    if (overlay.type === "actions") {
      const actions = actionsFor(overlay.target);
      if (key === "up" || key === "down") {
        setOverlay({ ...overlay, index: step(overlay.index, key === "up" ? -1 : 1, actions.length) });
      } else if (key === "ok") {
        runAction(overlay.target, actions[overlay.index].id);
      } else if (key === "back" || key === "menu") {
        setOverlay(null);
      }
    } else if (overlay.type === "folder") {
      const list = folderApps(overlay.folderId);
      const cols = 4;
      if (key === "left" || key === "right") {
        setOverlay({ ...overlay, index: step(overlay.index, key === "left" ? -1 : 1, list.length) });
      } else if (key === "up" || key === "down") {
        setOverlay({ ...overlay, index: step(overlay.index, key === "up" ? -cols : cols, list.length) });
      } else if (key === "back") {
        setOverlay(null);
      } else if (list[overlay.index] && (key === "menu" || long)) {
        setOverlay({ type: "actions", target: { kind: "app", id: list[overlay.index].id, folderId: overlay.folderId }, index: 0 });
      } else if (key === "ok" && list[overlay.index]) {
        setOverlay(null);
        launch(list[overlay.index]);
      }
    } else if (overlay.type === "control") {
      const cols = 4;
      if (key === "left" || key === "right") {
        setOverlay({ ...overlay, index: step(overlay.index, key === "left" ? -1 : 1, ccTiles.length) });
      } else if (key === "up") {
        if (overlay.index < cols) {
          setOverlay(null);
        } else {
          setOverlay({ ...overlay, index: overlay.index - cols });
        }
      } else if (key === "down") {
        if (overlay.index + cols < ccTiles.length) {
          setOverlay({ ...overlay, index: overlay.index + cols });
        } else {
          setOverlay(null);
        }
      } else if (key === "ok" && ccTiles[overlay.index]) {
        runTile(ccTiles[overlay.index].id);
      } else if (key === "back" || key === "red" || key === "yellow") {
        setOverlay(null);
      }
    } else if (overlay.type === "settings") {
      const row = rows[overlay.index];
      if (key === "up" || key === "down") {
        setOverlay({ type: "settings", index: step(overlay.index, key === "up" ? -1 : 1, rows.length) });
      } else if ((key === "left" || key === "right") && row && row.change) {
        row.change(key === "left" ? -1 : 1);
      } else if (key === "ok" && row) {
        if (row.activate) {
          row.activate();
        } else if (row.change) {
          row.change(1);
        }
      } else if (key === "back" || key === "blue" || key === "info") {
        setOverlay(null);
      }
    }
  };

  const dispatch = (key: Key, long: boolean) => {
    platform.watcher.activity();
    if (overlay) {
      onOverlayKey(key, long);
    } else {
      onHomeKey(key, long);
    }
  };
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = keyOf(event);
      if (!key) {
        return;
      }
      event.preventDefault();
      if (key !== "ok") {
        dispatchRef.current(key, false);
        return;
      }
      if (okTimer.current || okLong.current) {
        return; // key repeat while held
      }
      okTimer.current = window.setTimeout(() => {
        okTimer.current = 0;
        okLong.current = true;
        dispatchRef.current("ok", true);
      }, LONG_PRESS_MS);
    };
    const up = (event: KeyboardEvent) => {
      if (keyOf(event) !== "ok") {
        return;
      }
      if (okTimer.current) {
        clearTimeout(okTimer.current);
        okTimer.current = 0;
        dispatchRef.current("ok", false);
      }
      okLong.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // -- render ---------------------------------------------------------------------
  const note =
    watcher && watcher.disabled ? t("watcher.disabled", { reason: "" }).replace(/[:\s]+$/, "") : "";
  return (
    <div class="app">
      <div class="wallpaper" />
      <HomeView
        pages={pages}
        dock={dock}
        apps={appMap}
        focus={focus}
        settings={settings}
        tv={platform.tv}
        editing={!!edit}
        moving={!!edit && edit.kind === "move"}
        picking={!!edit && edit.kind === "pick"}
        t={t}
        watcherNote={note}
        lang={lang}
      />
      {overlay && overlay.type === "actions" ? (
        <ActionSheet
          title={
            overlay.target.kind === "folder"
              ? (layout.order.find((i) => isFolder(i) && i.folder === overlay.target.id) as { name: string } | undefined)?.name || ""
              : (appMap.get(overlay.target.id) || { name: "" }).name
          }
          actions={actionsFor(overlay.target)}
          index={overlay.index}
        />
      ) : null}
      {overlay && overlay.type === "folder" ? (
        <FolderView
          name={(layout.order.find((i) => isFolder(i) && i.folder === overlay.folderId) as { name: string } | undefined)?.name || ""}
          apps={folderApps(overlay.folderId)}
          index={overlay.index}
          tv={platform.tv}
          labels={settings.labels}
        />
      ) : null}
      {overlay && overlay.type === "control" ? (
        <ControlCenter t={t} inputs={inputTiles(t, inputs)} shortcuts={shortcuts} index={overlay.index} />
      ) : null}
      {overlay && overlay.type === "settings" ? (
        <SettingsPanel title={t("settings.title")} rows={rows} index={overlay.index} />
      ) : null}
      <Toast text={toast} />
    </div>
  );
};

