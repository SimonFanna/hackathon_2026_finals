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
  [2.545, 51.089], [2.75, 51.16], [2.92, 51.23], [3.13, 51.33], [3.37, 51.37], [3.52, 51.25], [3.86, 51.21],
  [4.08, 51.25], [4.24, 51.35], [4.31, 51.37], [4.38, 51.45], [4.47, 51.47], [4.57, 51.48], [4.77, 51.5],
  [4.92, 51.45], [5.03, 51.48], [5.1, 51.43], [5.24, 51.27], [5.47, 51.3], [5.55, 51.25], [5.83, 51.16],
  [5.79, 51.09], [5.73, 50.99], [5.64, 50.89], [5.7, 50.76], [5.8, 50.76], [6.02, 50.75], [6.03, 50.63],
  [6.26, 50.62], [6.25, 50.5], [6.4, 50.32], [6.14, 50.13], [5.97, 50.17], [5.84, 50.0], [5.74, 49.83],
  [5.8, 49.68], [5.77, 49.56], [5.47, 49.5], [5.32, 49.62], [5.3, 49.7], [5.07, 49.79], [4.86, 49.8],
  [4.85, 49.95], [4.88, 50.16], [4.79, 50.15], [4.68, 49.99], [4.23, 49.97], [4.15, 50.03], [4.21, 50.27],
  [4.11, 50.31], [3.94, 50.35], [3.68, 50.4], [3.58, 50.5], [3.3, 50.52], [3.2, 50.72], [3.12, 50.79],
  [3.0, 50.77], [2.88, 50.72], [2.8, 50.76], [2.62, 50.86], [2.545, 51.089],
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
