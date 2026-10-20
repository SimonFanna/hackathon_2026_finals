import { describe, expect, it } from "vitest";
import { ORDER, dragFocus, indexOfId, layout, nearestPlayable, releaseTarget } from "./carousel";

describe("carousel layout (cover-flow, no wrap)", () => {
  it("puts the entrepreneur first, then the house buyer, nothing locked", () => {
    expect(ORDER).toEqual(["business", "house"]);
    expect(indexOfId("business")).toBe(0);
    expect(indexOfId("house")).toBe(1);
  });

  it("puts the focused item front and centre, larger and fully lit", () => {
    const c = layout(1, 1);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
    expect(c.scale).toBeCloseTo(1);
    expect(c.light).toBeCloseTo(1);
    const side = layout(2, 1);
    expect(side.x).toBeGreaterThan(1.5);
    expect(side.z).toBeLessThan(0);
    expect(side.scale).toBeLessThan(1);
    expect(side.light).toBeLessThan(0.6);
    expect(layout(0, 1).x).toBeLessThan(0); // left neighbour goes left
  });

  it("recedes symmetrically and turns side items towards the centre", () => {
    const l = layout(0, 1);
    const r = layout(2, 1);
    expect(l.x).toBeCloseTo(-r.x);
    expect(l.z).toBeCloseTo(r.z);
    expect(l.rotY).toBeCloseTo(-r.rotY);
    expect(r.rotY).toBeLessThan(0); // right item faces left, towards the middle
  });

  it("snaps any position to the nearest playable item", () => {
    expect(nearestPlayable(-1)).toBe("business");
    expect(nearestPlayable(0.4)).toBe("business");
    expect(nearestPlayable(0.6)).toBe("house");
    expect(nearestPlayable(4)).toBe("house");
  });

  it("switches player after a short drag (about an eighth of the width)", () => {
    expect(nearestPlayable(dragFocus(0, -220, 1600))).toBe("house");
    expect(nearestPlayable(dragFocus(1, 220, 1600))).toBe("business");
    expect(nearestPlayable(dragFocus(0, -120, 1600))).toBe("business");
  });

  it("follows a quick flick even when the finger barely moved", () => {
    expect(releaseTarget(0.1, 3, "business")).toBe("house");
    expect(releaseTarget(0.9, -3, "house")).toBe("business");
    expect(releaseTarget(0.2, 0.2, "business")).toBe("business");
    expect(releaseTarget(0.7, 0, "business")).toBe("house");
  });

  it("turns a horizontal drag into a focus change, clamped to the list", () => {
    expect(dragFocus(1, -300, 1200)).toBeGreaterThan(1); // drag left → move right
    expect(dragFocus(1, 300, 1200)).toBeLessThan(1);
    expect(dragFocus(1, 99999, 1200)).toBeGreaterThanOrEqual(-0.4);
    expect(dragFocus(1, -99999, 1200)).toBeLessThanOrEqual(ORDER.length - 1 + 0.4);
  });
});
