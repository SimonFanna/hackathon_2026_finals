import { describe, expect, it } from "vitest";
import { BUILD_PHASES, glowScale, groundPx, lockedRGB, phasesForStep, ringOpacity, sway } from "./dioramas";

describe("diorama helpers", () => {
  it("glowScale dims side items, is 1 when centred and keeps growing during the dive", () => {
    expect(glowScale(1)).toBeCloseTo(1);
    expect(glowScale(0)).toBeGreaterThan(0);
    expect(glowScale(0.18)).toBeLessThan(0.4);
    expect(glowScale(2.5)).toBeGreaterThan(2);
    expect(glowScale(Number.NaN)).toBe(1);
  });

  it("lockedRGB turns colours grey-blue but keeps their value order", () => {
    const brick = lockedRGB(0.61, 0.35, 0.26);
    const trim = lockedRGB(0.91, 0.89, 0.85);
    const slate = lockedRGB(0.17, 0.2, 0.27);
    expect(brick[2]).toBeGreaterThan(brick[0]);
    const sum = (c: number[]) => c[0] + c[1] + c[2];
    expect(sum(trim)).toBeGreaterThan(sum(brick));
    expect(sum(brick)).toBeGreaterThan(sum(slate));
    for (const v of [...brick, ...trim, ...slate]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("lockedRGB keeps locked goals dark (night silhouettes, not grey clay)", () => {
    const white = lockedRGB(1, 1, 1);
    expect(Math.max(...white)).toBeLessThan(0.7);
    expect(Math.max(...lockedRGB(0, 0, 0))).toBeLessThan(0.1);
  });

  it("ringOpacity fades the selection ring in near the centre only", () => {
    expect(ringOpacity(0)).toBe(0);
    expect(ringOpacity(0.6)).toBe(0);
    expect(ringOpacity(0.8)).toBeCloseTo(0.5);
    expect(ringOpacity(1)).toBe(1);
    expect(ringOpacity(2.5)).toBe(1);
  });

  it("groundPx maps the plinth square onto the ground canvas", () => {
    expect(groundPx(-1.62, 512)).toBeCloseTo(0);
    expect(groundPx(0, 512)).toBeCloseTo(256);
    expect(groundPx(1.62, 512)).toBeCloseTo(512);
  });

  it("sway stays within its amplitude", () => {
    for (let t = 0; t < 20; t += 0.37) expect(Math.abs(sway(t, 0.07))).toBeLessThanOrEqual(0.07 + 1e-9);
  });
});

describe("build phases (build stage)", () => {
  it("gives every step at least one phase when there are enough phases, in order, covering all of them", () => {
    for (const [, count] of Object.entries(BUILD_PHASES)) {
      for (const steps of [1, 4, count, count - 1]) {
        const all = Array.from({ length: steps }, (_, i) => phasesForStep(i, steps, count));
        const flat = all.flat();
        expect(flat).toEqual(Array.from({ length: count }, (_, i) => i + 1));
        if (steps <= count) for (const ph of all) expect(ph.length).toBeGreaterThan(0);
      }
    }
  });

  it("is empty for bad input", () => {
    expect(phasesForStep(0, 0, 11)).toEqual([]);
    expect(phasesForStep(3, 3, 11)).toEqual([]);
    expect(phasesForStep(-1, 3, 11)).toEqual([]);
  });
});
