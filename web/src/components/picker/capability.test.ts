import { describe, expect, it } from "vitest";
import { pickerMode } from "./capability";

describe("pickerMode", () => {
  it("uses 3D on a capable desktop", () => {
    expect(pickerMode({ compact: false, search: "", webgl: true })).toBe("3d");
  });
  it("falls back to Victor's 2D picker when it should", () => {
    expect(pickerMode({ compact: true, search: "", webgl: true })).toBe("2d");
    expect(pickerMode({ compact: false, search: "?q=low", webgl: true })).toBe("2d");
    expect(pickerMode({ compact: false, search: "", webgl: false })).toBe("2d");
  });
  it("skips the 3D when a deep link jumps past the picker", () => {
    expect(pickerMode({ compact: false, search: "?player=business", webgl: true })).toBe("2d");
    expect(pickerMode({ compact: false, search: "?demo=live", webgl: true })).toBe("2d");
  });
  it("can be forced on for captures", () => {
    expect(pickerMode({ compact: false, search: "?q=high", webgl: true })).toBe("3d");
  });
});
