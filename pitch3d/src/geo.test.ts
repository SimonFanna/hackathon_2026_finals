import { describe, expect, it } from "vitest";
import { BELGIUM, insidePolygon, project, sampleField } from "./geo";

describe("geo", () => {
  it("puts Leuven at the origin and Antwerp north-west of it, about 45 km away", () => {
    const leuven = project(50.879, 4.701);
    expect(Math.abs(leuven.x) + Math.abs(leuven.z)).toBeLessThan(1e-9);
    const antwerp = project(51.219, 4.402);
    expect(antwerp.x).toBeLessThan(0); // west
    expect(antwerp.z).toBeLessThan(0); // north is -z
    expect(Math.hypot(antwerp.x, antwerp.z)).toBeGreaterThan(38);
    expect(Math.hypot(antwerp.x, antwerp.z)).toBeLessThan(48);
  });

  it("knows Brussels and Namur are inside Belgium and Paris and Amsterdam are not", () => {
    const poly = BELGIUM.map(([lon, lat]) => project(lat, lon));
    expect(insidePolygon(project(50.847, 4.357), poly)).toBe(true);
    expect(insidePolygon(project(50.467, 4.867), poly)).toBe(true);
    expect(insidePolygon(project(48.857, 2.352), poly)).toBe(false);
    expect(insidePolygon(project(52.37, 4.9), poly)).toBe(false);
  });

  it("samples a deterministic field of points inside Belgium", () => {
    const a = sampleField(500, [{ lat: 51.219, lon: 4.402, weight: 1 }], 7);
    const b = sampleField(500, [{ lat: 51.219, lon: 4.402, weight: 1 }], 7);
    expect(a).toEqual(b);
    expect(a.length).toBe(500 * 3);
    const poly = BELGIUM.map(([lon, lat]) => project(lat, lon));
    for (let i = 0; i < a.length; i += 3) expect(insidePolygon({ x: a[i], z: a[i + 2] }, poly)).toBe(true);
  });
});
