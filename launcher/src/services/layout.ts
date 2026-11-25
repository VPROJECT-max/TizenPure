// The home layout: a flat, ordered list of apps and folders (paginated at render time, so
// changing grid density never loses an icon), a dock and a hidden list. Pure functions only.

export const LAYOUT_KEY = "tizenpure.layout.v1";
export const DOCK_MAX = 6;
export const FOLDER_MAX = 12;
export const DEFAULT_DOCK_HINTS = [/netflix/i, /youtube/i, /prime video/i, /disney/i, /hbo|max/i, /tv plus|live/i];

export interface Folder {
  readonly folder: string; // stable id
  readonly name: string;
  readonly apps: readonly string[];
}
export type Item = string | Folder;

export interface Layout {
  readonly version: 1;
  readonly order: readonly Item[];
  readonly dock: readonly string[];
  readonly hidden: readonly string[];
}

export const EMPTY_LAYOUT: Layout = { version: 1, order: [], dock: [], hidden: [] };

export const isFolder = (item: Item): item is Folder => typeof item !== "string";
export const itemId = (item: Item) => (isFolder(item) ? item.folder : item);

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length < 200).slice(0, max) : [];

export const normalizeLayout = (input: unknown): Layout => {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.order)) {
    return EMPTY_LAYOUT;
  }
  const order: Item[] = [];
  for (const entry of v.order.slice(0, 500)) {
    if (typeof entry === "string") {
      order.push(entry);
    } else if (entry && typeof entry === "object") {
      const f = entry as Record<string, unknown>;
      if (typeof f.folder === "string" && typeof f.name === "string") {
        order.push({ folder: f.folder, name: f.name.slice(0, 40), apps: strings(f.apps, FOLDER_MAX) });
      }
    }
  }
  return { version: 1, order, dock: strings(v.dock, DOCK_MAX), hidden: strings(v.hidden, 500) };
};

/** Drop uninstalled apps, unwrap 1-app folders, append new apps, pick a first dock. */
export const reconcile = (layout: Layout, installed: readonly { id: string; name: string }[]): Layout => {
  const ids = new Set(installed.map((a) => a.id));
  const placed = new Set<string>();
  const order: Item[] = [];
  for (const item of layout.order) {
    if (isFolder(item)) {
      const apps = item.apps.filter((id) => ids.has(id) && !placed.has(id));
      apps.forEach((id) => placed.add(id));
      if (apps.length > 1) {
        order.push({ ...item, apps });
      } else if (apps.length === 1) {
        order.push(apps[0]);
      }
    } else if (ids.has(item) && !placed.has(item)) {
      placed.add(item);
      order.push(item);
    }
  }
  const hidden = layout.hidden.filter((id) => ids.has(id));
  const fresh = installed
    .filter((a) => !placed.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => a.id);
  let dock = layout.dock.filter((id) => ids.has(id));
  if (!layout.order.length && !dock.length) {
    // First run: put the familiar streaming apps in the dock.
    for (const hint of DEFAULT_DOCK_HINTS) {
      const app = installed.find((a) => hint.test(a.name) && dock.indexOf(a.id) < 0);
      if (app && dock.length < DOCK_MAX) {
        dock = [...dock, app.id];
      }
    }
  }
  return { version: 1, order: [...order, ...fresh], dock, hidden };
};

/** The grid shows everything except hidden apps and apps in the dock. */
export const gridItems = (layout: Layout): Item[] =>
  layout.order.filter((item) => isFolder(item) || (layout.hidden.indexOf(item) < 0 && layout.dock.indexOf(item) < 0));

export const paginate = <T>(items: readonly T[], perPage: number): T[][] => {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  return pages.length ? pages : [[]];
};

/** Move the grid item at visible index `from` to visible index `to`. */
export const moveItem = (layout: Layout, from: number, to: number): Layout => {
  const visible = gridItems(layout);
  if (from === to || !visible[from] || to < 0 || to >= visible.length) {
    return layout;
  }
  const moving = visible[from];
  const target = visible[to];
  const order = layout.order.filter((item) => item !== moving);
  const at = order.indexOf(target);
  order.splice(from < to ? at + 1 : at, 0, moving);
  return { ...layout, order };
};

export const setHidden = (layout: Layout, id: string, hidden: boolean): Layout => ({
  ...layout,
  hidden: hidden ? (layout.hidden.indexOf(id) < 0 ? [...layout.hidden, id] : layout.hidden) : layout.hidden.filter((h) => h !== id),
  dock: hidden ? layout.dock.filter((d) => d !== id) : layout.dock,
});

export const toggleDock = (layout: Layout, id: string): Layout => {
  if (layout.dock.indexOf(id) >= 0) {
    return { ...layout, dock: layout.dock.filter((d) => d !== id) };
  }
  if (layout.dock.length >= DOCK_MAX) {
    return layout;
  }
  // Pull it out of any folder so it lives in one place.
  const order = layout.order.map((item) =>
    isFolder(item) && item.apps.indexOf(id) >= 0 ? { ...item, apps: item.apps.filter((a) => a !== id) } : item,
  );
  return { ...layout, order: order.indexOf(id) < 0 ? [...order, id] : order, dock: [...layout.dock, id] };
};

export const moveInDock = (layout: Layout, from: number, to: number): Layout => {
  if (to < 0 || to >= layout.dock.length || from === to) {
    return layout;
  }
  const dock = layout.dock.slice();
  const [id] = dock.splice(from, 1);
  dock.splice(to, 0, id);
  return { ...layout, dock };
};

/** Drop app `id` onto grid item `target`: create a folder, or add to an existing one. */
export const groupInto = (layout: Layout, id: string, target: Item, newId: string, name: string): Layout => {
  if (itemId(target) === id) {
    return layout;
  }
  if (isFolder(target) && target.apps.length >= FOLDER_MAX) {
    return layout;
  }
  const order: Item[] = [];
  for (const item of layout.order) {
    if (item === id) {
      continue;
    }
    if (item === target) {
      order.push(
        isFolder(item) ? { ...item, apps: [...item.apps, id] } : { folder: newId, name, apps: [item as string, id] },
      );
    } else {
      order.push(item);
    }
  }
  return { ...layout, order };
};

export const removeFromFolder = (layout: Layout, folderId: string, id: string): Layout => {
  const order: Item[] = [];
  for (const item of layout.order) {
    if (isFolder(item) && item.folder === folderId) {
      const apps = item.apps.filter((a) => a !== id);
      if (apps.length > 1) {
        order.push({ ...item, apps });
      } else if (apps.length === 1) {
        order.push(apps[0]);
      }
      order.push(id);
    } else {
      order.push(item);
    }
  }
  return { ...layout, order };
};

export const renameFolder = (layout: Layout, folderId: string, name: string): Layout => ({
  ...layout,
  order: layout.order.map((item) => (isFolder(item) && item.folder === folderId ? { ...item, name: name.slice(0, 40) } : item)),
});
