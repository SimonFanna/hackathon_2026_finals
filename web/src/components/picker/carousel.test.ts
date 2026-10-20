import { describe, expect, it } from "vitest";
import { ORDER, dragFocus, indexOfId, layout, nearestPlayable, releaseTarget } from "./carousel";

describe("carousel layout (cover-flow, no wrap)", () => {
  it("orders the two players in the middle and the locked goals on the sides", () => {
    expect(ORDER).toEqual(["retire", "house", "business", "baby", "car"]);
    expect(indexOfId("house")).toBe(1);
    expect(indexOfId("business")).toBe(2);
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
    expect(nearestPlayable(0)).toBe("house");
    expect(nearestPlayable(1.4)).toBe("house");
    expect(nearestPlayable(1.6)).toBe("business");
    expect(nearestPlayable(4)).toBe("business");
  });

  it("switches player after a short drag (about an eighth of the width)", () => {
    expect(nearestPlayable(dragFocus(1, -220, 1600))).toBe("business");
    expect(nearestPlayable(dragFocus(2, 220, 1600))).toBe("house");
    expect(nearestPlayable(dragFocus(1, -120, 1600))).toBe("house");
  });

  it("follows a quick flick even when the finger barely moved", () => {
    expect(releaseTarget(1.1, 3, "house")).toBe("business");
    expect(releaseTarget(1.9, -3, "business")).toBe("house");
    expect(releaseTarget(1.2, 0.2, "house")).toBe("house");
    expect(releaseTarget(1.7, 0, "house")).toBe("business");
  });

  it("turns a horizontal drag into a focus change, clamped to the list", () => {
    expect(dragFocus(1, -300, 1200)).toBeGreaterThan(1); // drag left → move right
    expect(dragFocus(1, 300, 1200)).toBeLessThan(1);
    expect(dragFocus(1, 99999, 1200)).toBeGreaterThanOrEqual(-0.4);
    expect(dragFocus(1, -99999, 1200)).toBeLessThanOrEqual(ORDER.length - 1 + 0.4);
  });
});
