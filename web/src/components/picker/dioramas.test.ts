import { describe, expect, it } from "vitest";
import { glowScale, groundPx, lockedRGB, sway } from "./dioramas";

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

  it("groundPx maps the plinth square onto the ground canvas", () => {
    expect(groundPx(-1.62, 512)).toBeCloseTo(0);
    expect(groundPx(0, 512)).toBeCloseTo(256);
    expect(groundPx(1.62, 512)).toBeCloseTo(512);
  });

  it("sway stays within its amplitude", () => {
    for (let t = 0; t < 20; t += 0.37) expect(Math.abs(sway(t, 0.07))).toBeLessThanOrEqual(0.07 + 1e-9);
  });
});
