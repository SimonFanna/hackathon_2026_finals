import { describe, expect, it } from "vitest";
import { BEAT_COUNT, actionForKey, clampBeat, parseParams, step } from "./beats";
import { FpsGovernor } from "./quality";

describe("beats", () => {
  it("has 7 beats and clamps at both ends", () => {
    expect(BEAT_COUNT).toBe(7);
    expect(step(0, "prev")).toBe(0);
    expect(step(6, "next")).toBe(6);
    expect(step(2, "next")).toBe(3);
    expect(step(4, "restart")).toBe(0);
  });

  it("maps presenter keys, including clicker PageDown/PageUp", () => {
    for (const k of ["ArrowRight", "PageDown", " ", "Enter"]) expect(actionForKey(k)).toBe("next");
    for (const k of ["ArrowLeft", "PageUp", "Backspace"]) expect(actionForKey(k)).toBe("prev");
    expect(actionForKey("r")).toBe("restart");
    expect(actionForKey("R")).toBe("restart");
    expect(actionForKey("q")).toBe("quality");
    expect(actionForKey("x")).toBeNull();
  });

  it("reads ?beat=N and ?q=low safely", () => {
    expect(parseParams("?beat=4&q=low")).toEqual({ beat: 4, quality: "low" });
    expect(parseParams("?beat=99")).toEqual({ beat: 6, quality: null });
    expect(parseParams("?beat=abc")).toEqual({ beat: 0, quality: null });
    expect(parseParams("")).toEqual({ beat: 0, quality: null });
    expect(clampBeat(-3)).toBe(0);
  });
});

describe("FpsGovernor", () => {
  it("asks to drop to low quality when the 2 s average stays under 30 fps", () => {
    const g = new FpsGovernor({ windowMs: 2000, minFps: 30, warmupMs: 1000 });
    let t = 0;
    let verdict = false;
    for (let i = 0; i < 200; i++) { t += 50; verdict = g.sample(t) || verdict; } // 20 fps
    expect(verdict).toBe(true);
  });

  it("stays quiet at 60 fps and during warm-up", () => {
    const g = new FpsGovernor({ windowMs: 2000, minFps: 30, warmupMs: 1000 });
    let t = 0;
    let verdict = false;
    for (let i = 0; i < 400; i++) { t += 16.7; verdict = g.sample(t) || verdict; }
    expect(verdict).toBe(false);
    expect(g.fps).toBeGreaterThan(55);
  });
});
