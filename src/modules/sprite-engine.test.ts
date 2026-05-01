import { describe, it, expect } from "bun:test";
import {
  spriteIdToColor,
  hslToRgb,
  computeBobOffset,
  computeHueShift,
} from "./sprite-engine";

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

describe("sprite-engine: spriteIdToColor", () => {
  it("maps known sprite IDs to their designated colors", () => {
    expect(spriteIdToColor("sprite-glitchkin")).toBe(0xff4466); // red-pink
    expect(spriteIdToColor("sprite-mapsie")).toBe(0x44dddd); // teal
    expect(spriteIdToColor("sprite-blipblop")).toBe(0xaa66ff); // purple
  });

  it("returns a deterministic color for unknown sprite IDs", () => {
    const color1 = spriteIdToColor("sprite-unknown");
    const color2 = spriteIdToColor("sprite-unknown");
    expect(color1).toBe(color2); // stable hash
    expect(typeof color1).toBe("number");
    expect(color1).toBeGreaterThanOrEqual(0);
    expect(color1).toBeLessThanOrEqual(0xffffff);
  });

  it("returns different colors for different unknown sprite IDs", () => {
    const colorA = spriteIdToColor("sprite-test-a");
    const colorB = spriteIdToColor("sprite-test-b");
    expect(colorA).not.toBe(colorB);
  });
});

// ---------------------------------------------------------------------------
// HSL → RGB conversion
// ---------------------------------------------------------------------------

describe("sprite-engine: hslToRgb", () => {
  it("converts pure red (0°, 100%, 50%)", () => {
    expect(hslToRgb(0, 100, 50)).toBe(0xff0000);
  });

  it("converts pure green (120°, 100%, 50%)", () => {
    expect(hslToRgb(120, 100, 50)).toBe(0x00ff00);
  });

  it("converts pure blue (240°, 100%, 50%)", () => {
    expect(hslToRgb(240, 100, 50)).toBe(0x0000ff);
  });

  it("converts gray (any hue, 0%, 50%)", () => {
    const gray = hslToRgb(180, 0, 50);
    // Should be ~0x808080 (128, 128, 128)
    const r = (gray >> 16) & 0xff;
    const g = (gray >> 8) & 0xff;
    const b = gray & 0xff;
    expect(Math.abs(r - 128)).toBeLessThan(2);
    expect(Math.abs(g - 128)).toBeLessThan(2);
    expect(Math.abs(b - 128)).toBeLessThan(2);
  });

  it("converts white (any hue, any sat, 100%)", () => {
    expect(hslToRgb(0, 50, 100)).toBe(0xffffff);
  });

  it("converts black (any hue, any sat, 0%)", () => {
    expect(hslToRgb(0, 50, 0)).toBe(0x000000);
  });
});

// ---------------------------------------------------------------------------
// Bob offset (sine wave vertical displacement)
// ---------------------------------------------------------------------------

describe("sprite-engine: computeBobOffset", () => {
  it("returns 0 at t=0 (start of sine wave)", () => {
    expect(computeBobOffset(0, 1000, 10)).toBeCloseTo(0, 1);
  });

  it("returns ~range at t=period/4 (peak of sine wave)", () => {
    const offset = computeBobOffset(250, 1000, 10);
    expect(offset).toBeCloseTo(10, 1);
  });

  it("returns 0 at t=period/2 (middle of sine wave)", () => {
    const offset = computeBobOffset(500, 1000, 10);
    expect(offset).toBeCloseTo(0, 1);
  });

  it("returns ~-range at t=3*period/4 (trough of sine wave)", () => {
    const offset = computeBobOffset(750, 1000, 10);
    expect(offset).toBeCloseTo(-10, 1);
  });

  it("returns 0 at t=period (full cycle)", () => {
    const offset = computeBobOffset(1000, 1000, 10);
    expect(offset).toBeCloseTo(0, 1);
  });

  it("handles different period and range values", () => {
    const offset = computeBobOffset(500, 2000, 5);
    // At 500ms with 2000ms period = quarter cycle
    expect(offset).toBeCloseTo(5, 1);
  });
});

// ---------------------------------------------------------------------------
// Hue shift (sine wave angle delta)
// ---------------------------------------------------------------------------

describe("sprite-engine: computeHueShift", () => {
  it("returns 0 at t=0 (start of sine wave)", () => {
    expect(computeHueShift(0, 4000, 10)).toBeCloseTo(0, 1);
  });

  it("returns ~shift at t=period/4 (peak)", () => {
    const shift = computeHueShift(1000, 4000, 10);
    expect(shift).toBeCloseTo(10, 1);
  });

  it("returns 0 at t=period/2 (middle)", () => {
    const shift = computeHueShift(2000, 4000, 10);
    expect(shift).toBeCloseTo(0, 1);
  });

  it("returns ~-shift at t=3*period/4 (trough)", () => {
    const shift = computeHueShift(3000, 4000, 10);
    expect(shift).toBeCloseTo(-10, 1);
  });

  it("returns 0 at t=period (full cycle)", () => {
    const shift = computeHueShift(4000, 4000, 10);
    expect(shift).toBeCloseTo(0, 1);
  });
});
