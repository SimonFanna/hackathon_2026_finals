// Pure geography: lat/lon → scene units (1 unit = 1 km, Leuven at the origin, north = −z),
// an approximate Belgium outline, and a deterministic light field inside it.

export interface XZ { x: number; z: number }

const ORIGIN = { lat: 50.879, lon: 4.701 }; // Leuven
const KM_PER_DEG_LAT = 111.32;

export function project(lat: number, lon: number): XZ {
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);
  return { x: (lon - ORIGIN.lon) * kmPerDegLon, z: -(lat - ORIGIN.lat) * KM_PER_DEG_LAT };
}

/** Approximate national border, [lon, lat], clockwise from De Panne. Good enough for a night map. */
export const BELGIUM: [number, number][] = [
  [2.545, 51.089], [2.9, 51.24], [3.37, 51.37], [3.52, 51.29], [3.8, 51.21], [4.05, 51.25], [4.24, 51.37],
  [4.4, 51.46], [4.55, 51.48], [4.77, 51.5], [4.93, 51.4], [5.1, 51.43], [5.24, 51.27], [5.5, 51.29],
  [5.85, 51.15], [5.77, 51.0], [5.64, 50.85], [5.7, 50.76], [6.02, 50.75], [6.27, 50.62], [6.4, 50.33],
  [6.13, 50.13], [5.98, 50.17], [5.81, 49.98], [5.9, 49.68], [5.81, 49.55], [5.47, 49.5], [5.2, 49.69],
  [4.85, 49.8], [4.86, 50.0], [4.8, 50.15], [4.67, 50.0], [4.18, 49.98], [4.21, 50.27], [3.65, 50.35],
  [3.3, 50.52], [3.1, 50.78], [2.85, 50.7], [2.6, 50.82], [2.545, 51.089],
];

export function insidePolygon(p: XZ, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Small seeded PRNG (mulberry32) so every run draws the same field. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` points (flat [x, y, z, …]) inside Belgium: 60% clustered around weighted city centres,
 * 40% spread across the country, so the map reads as "everyone", denser where people live.
 */
export function sampleField(count: number, cities: { lat: number; lon: number; weight: number }[], seed = 1): number[] {
  const rand = rng(seed);
  const poly = BELGIUM.map(([lon, lat]) => project(lat, lon));
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  const centres = cities.map((c) => ({ ...project(c.lat, c.lon), w: c.weight }));
  const total = centres.reduce((a, c) => a + c.w, 0);
  const out: number[] = [];
  let guard = 0;
  while (out.length < count * 3 && guard++ < count * 50) {
    let p: XZ;
    if (centres.length && rand() < 0.6) {
      let r = rand() * total;
      const c = centres.find((k) => (r -= k.w) <= 0) ?? centres[0];
      const radius = 3 + 9 * Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * 0.5;
      const angle = rand() * Math.PI * 2;
      p = { x: c.x + Math.cos(angle) * radius, z: c.z + Math.sin(angle) * radius };
    } else {
      p = { x: box.x0 + rand() * (box.x1 - box.x0), z: box.z0 + rand() * (box.z1 - box.z0) };
    }
    if (insidePolygon(p, poly)) out.push(p.x, 0, p.z);
  }
  return out;
}
