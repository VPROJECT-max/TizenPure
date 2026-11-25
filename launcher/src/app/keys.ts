// Remote-control key mapping. Tizen TV key codes, with desktop fallbacks for `npm run dev`.
export type Key = "up" | "down" | "left" | "right" | "ok" | "back" | "red" | "green" | "yellow" | "blue" | "menu" | "info";

const CODES: Record<number, Key> = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "ok",
  10009: "back",
  8: "back",
  27: "back",
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
  457: "info",
  10135: "menu", // Tools
  18: "menu",
  93: "menu", // ContextMenu on a keyboard
};

export const REGISTERED_KEYS = ["ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue", "Info", "Tools"] as const;

export const keyOf = (event: { keyCode: number; key?: string }): Key | null => {
  if (CODES[event.keyCode]) {
    return CODES[event.keyCode];
  }
  if (event.key === "m" || event.key === "M") {
    return "menu";
  }
  return null;
};

export const LONG_PRESS_MS = 600;
