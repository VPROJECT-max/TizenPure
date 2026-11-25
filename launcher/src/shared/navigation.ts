// Pure D-pad focus model for the home screen: a paged grid above a dock.

export type Direction = "up" | "down" | "left" | "right";

export interface HomeFocus {
  readonly zone: "grid" | "dock";
  readonly page: number;
  readonly index: number; // index within the page, or within the dock
}

export interface HomeShape {
  readonly pageSizes: readonly number[]; // items per page
  readonly columns: number;
  readonly dockSize: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const clampFocus = (focus: HomeFocus, shape: HomeShape): HomeFocus => {
  if (focus.zone === "dock") {
    if (shape.dockSize) {
      return { ...focus, index: clamp(focus.index, 0, shape.dockSize - 1) };
    }
    return { zone: "grid", page: 0, index: 0 };
  }
  const page = clamp(focus.page, 0, Math.max(0, shape.pageSizes.length - 1));
  const size = shape.pageSizes[page] || 0;
  if (!size) {
    return shape.dockSize ? { zone: "dock", page, index: 0 } : { zone: "grid", page, index: 0 };
  }
  return { zone: "grid", page, index: clamp(focus.index, 0, size - 1) };
};

/** Returns the next focus, or "top" when Up leaves the grid's first row. */
export const move = (focus: HomeFocus, dir: Direction, shape: HomeShape): HomeFocus | "top" => {
  const cols = shape.columns;
  if (focus.zone === "dock") {
    if (dir === "left") {
      return { ...focus, index: Math.max(0, focus.index - 1) };
    }
    if (dir === "right") {
      return { ...focus, index: Math.min(shape.dockSize - 1, focus.index + 1) };
    }
    if (dir === "up") {
      const size = shape.pageSizes[focus.page] || 0;
      if (!size) {
        return "top";
      }
      const lastRowStart = Math.floor((size - 1) / cols) * cols;
      const col = Math.round((focus.index / Math.max(1, shape.dockSize - 1)) * (cols - 1));
      return { zone: "grid", page: focus.page, index: Math.min(size - 1, lastRowStart + col) };
    }
    return focus;
  }
  const size = shape.pageSizes[focus.page] || 0;
  const row = Math.floor(focus.index / cols);
  const col = focus.index % cols;
  const pages = shape.pageSizes.length;
  switch (dir) {
    case "left":
      if (col > 0) {
        return { ...focus, index: focus.index - 1 };
      }
      if (focus.page > 0) {
        const prev = shape.pageSizes[focus.page - 1];
        return { zone: "grid", page: focus.page - 1, index: Math.min(prev - 1, row * cols + cols - 1) };
      }
      return focus;
    case "right":
      if (col < cols - 1 && focus.index + 1 < size) {
        return { ...focus, index: focus.index + 1 };
      }
      if (focus.page < pages - 1) {
        const next = shape.pageSizes[focus.page + 1];
        return { zone: "grid", page: focus.page + 1, index: Math.min(next - 1, row * cols) };
      }
      return focus;
    case "up":
      return row > 0 ? { ...focus, index: focus.index - cols } : "top";
    case "down": {
      if (focus.index + cols < size) {
        return { ...focus, index: focus.index + cols };
      }
      const lastRow = Math.floor((size - 1) / cols);
      if (row < lastRow) {
        return { ...focus, index: size - 1 };
      }
      if (shape.dockSize) {
        const dockIndex = Math.round((col / Math.max(1, cols - 1)) * (shape.dockSize - 1));
        return { zone: "dock", page: focus.page, index: dockIndex };
      }
      return focus;
    }
  }
  return focus;
};

/** Generic 1-D list movement used by panels and settings. */
export const step = (index: number, delta: number, length: number, wrap = false) => {
  if (!length) {
    return 0;
  }
  const next = index + delta;
  if (wrap) {
    return (next + length) % length;
  }
  return clamp(next, 0, length - 1);
};
