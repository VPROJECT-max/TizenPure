// Performance tiers. 'full' = frosted glass, 'reduced' = small blur radius on the dock only,
// 'flat' = no backdrop-filter at all (solid translucent surfaces).
// The startup probe follows glass-home's pattern: sample frames for ~2.5 s after the first
// paint settles; a median frame time over 26 ms means the GPU can't keep up.

export type Tier = "full" | "reduced" | "flat";

export const SLOW_FRAME_MS = 26;
export const JANKY_FRAME_MS = 20;
const MIN_SAMPLES = 20;

export const tierFromFrames = (frames: readonly number[], deviceMemoryGb?: number): Tier => {
  if (frames.length < MIN_SAMPLES) {
    return deviceMemoryGb !== undefined && deviceMemoryGb <= 1 ? "flat" : "reduced";
  }
  const sorted = frames.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median > SLOW_FRAME_MS) {
    return "flat";
  }
  if (median > JANKY_FRAME_MS || (deviceMemoryGb !== undefined && deviceMemoryGb <= 1.5)) {
    return "reduced";
  }
  return "full";
};

export const supportsBackdrop = (): boolean => {
  try {
    const css = (window as unknown as { CSS?: { supports(p: string, v: string): boolean } }).CSS;
    return !!css && (css.supports("backdrop-filter", "blur(1px)") || css.supports("-webkit-backdrop-filter", "blur(1px)"));
  } catch {
    return false;
  }
};

export const probeFrames = (done: (frames: number[]) => void, delayMs = 2500, sampleMs = 2500) => {
  if (typeof requestAnimationFrame !== "function") {
    done([]);
    return;
  }
  const frames: number[] = [];
  setTimeout(() => {
    let last = 0;
    const end = Date.now() + sampleMs;
    const tick = (t: number) => {
      if (last) {
        frames.push(t - last);
      }
      last = t;
      if (Date.now() < end && !document.hidden) {
        requestAnimationFrame(tick);
      } else {
        done(frames);
      }
    };
    requestAnimationFrame(tick);
  }, delayMs);
};
