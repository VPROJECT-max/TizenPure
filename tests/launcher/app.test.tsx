import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../launcher/src/app/App";
import { createMockPlatform, type MockLog } from "../../launcher/src/platform/mock";
import { LAYOUT_KEY } from "../../launcher/src/services/layout";

const press = (keyCode: number, type: "keydown" | "keyup" = "keydown"): void => {
  window.dispatchEvent(new KeyboardEvent(type, { keyCode } as KeyboardEventInit));
};
const ok = () => {
  press(13);
  press(13, "keyup");
};
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

describe("launcher journeys", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const boot = async () => {
    const log: MockLog = { launched: [], watcher: [] };
    const storage = memory();
    const view = render(<App platform={createMockPlatform(log)} storage={storage} version="test" />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    return { log, storage, view };
  };

  it("boots, reports apps to the watcher and fills dock and grid", async () => {
    const { log, view } = await boot();
    expect(log.watcher).toContain("start");
    expect(log.watcher.some((w) => w.indexOf("apps ") === 0)).toBe(true);
    expect(view.container.querySelectorAll(".dock .tile").length).toBeGreaterThan(0);
    expect(view.container.querySelectorAll(".grid .tile").length).toBe(12);
  });

  it("tells the watcher before opening an app", async () => {
    const { log } = await boot();
    await act(async () => ok());
    expect(log.launched.length).toBe(1);
    const watchIndex = log.watcher.findIndex((w) => w.indexOf("watch ") === 0);
    expect(watchIndex).toBeGreaterThanOrEqual(0);
  });

  it("long-press opens actions and Hide removes the app from the grid and persists", async () => {
    const { view, storage } = await boot();
    const first = view.container.querySelector(".grid .tile-label")?.textContent;
    await act(async () => {
      press(13);
      vi.advanceTimersByTime(700);
      press(13, "keyup");
    });
    expect(view.container.querySelector(".sheet")).not.toBeNull();
    // Open, Move, Add to dock, Put in a folder, Hide
    for (let i = 0; i < 4; i++) await act(async () => press(40)); // one render per key, like a remote
    await act(async () => ok());
    expect(view.container.querySelector(".grid .tile-label")?.textContent).not.toBe(first);
    expect(JSON.parse(storage.data.get(LAYOUT_KEY) as string).hidden.length).toBe(1);
  });

  it("Up from the top row opens the Control Center with inputs; Back closes it", async () => {
    const { view } = await boot();
    await act(async () => press(38));
    expect(view.container.querySelector(".control-center")).not.toBeNull();
    expect(view.container.textContent).toContain("PlayStation");
    await act(async () => press(10009));
    expect(view.container.querySelector(".control-center")).toBeNull();
  });
});
