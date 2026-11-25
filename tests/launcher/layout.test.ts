import { describe, expect, it } from "vitest";

import {
  EMPTY_LAYOUT,
  gridItems,
  groupInto,
  isFolder,
  type Layout,
  moveItem,
  normalizeLayout,
  paginate,
  reconcile,
  removeFromFolder,
  setHidden,
  toggleDock,
} from "../../launcher/src/services/layout";

const apps = ["Netflix", "YouTube", "Plex", "Browser", "Twitch"].map((name) => ({ id: name.toLowerCase(), name }));

describe("layout", () => {
  it("first run puts streaming apps in the dock and everything else on the grid", () => {
    const l = reconcile(EMPTY_LAYOUT, apps);
    expect(l.dock).toEqual(["netflix", "youtube"]);
    expect(gridItems(l)).toEqual(["browser", "plex", "twitch"]);
  });

  it("drops uninstalled apps, unwraps one-app folders and appends new ones", () => {
    const start = { version: 1 as const, order: [{ folder: "f", name: "F", apps: ["plex", "gone"] }, "gone2"], dock: ["gone"], hidden: ["gone"] };
    const l = reconcile(start, apps);
    expect(l.order[0]).toBe("plex");
    expect(l.dock).toEqual([]);
    expect(l.hidden).toEqual([]);
    expect(l.order).toContain("twitch");
  });

  it("never loses an app when moving, hiding, docking or grouping", () => {
    let l = reconcile(EMPTY_LAYOUT, apps);
    l = moveItem(l, 0, 2);
    l = setHidden(l, "plex", true);
    l = toggleDock(l, "twitch");
    l = groupInto(l, "browser", gridItems(l)[0], "f1", "Folder 1");
    const everywhere = new Set<string>([...l.dock, ...l.hidden]);
    for (const item of l.order) (isFolder(item) ? item.apps : [item]).forEach((id) => everywhere.add(id));
    expect([...everywhere].sort()).toEqual(apps.map((a) => a.id).sort());
  });

  it("removing the last-but-one app from a folder unwraps it", () => {
    let l: Layout = { version: 1, order: [{ folder: "f", name: "F", apps: ["plex", "browser"] }], dock: [], hidden: [] };
    l = removeFromFolder(l, "f", "plex");
    expect(l.order).toEqual(["browser", "plex"]);
  });

  it("paginates without losing items and always has one page", () => {
    expect(paginate([], 12)).toEqual([[]]);
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("normalize rejects garbage", () => {
    expect(normalizeLayout(null)).toBe(EMPTY_LAYOUT);
    expect(normalizeLayout({ version: 2, order: [] })).toBe(EMPTY_LAYOUT);
    expect(normalizeLayout({ version: 1, order: ["a", 5, { folder: "x" }], dock: [1, "b"], hidden: "c" })).toEqual({
      version: 1,
      order: ["a"],
      dock: ["b"],
      hidden: [],
    });
  });
});
