import * as THREE from "three";
import { BELGIUM, project, rng, sampleField } from "../geo";
import type { CityLight } from "../story";
import { C } from "./materials";

// Finale map at real scale (1 unit = 1 km, Leuven at the origin).
// Move (a): one light per synthetic customer on their city. Move (b): a dense field = everyone.

export interface BelgiumMap {
  root: THREE.Group;
  apply(map: number, realLights: number, field: number, t: number): void;
  cityAnchors: { city: string; pos: THREE.Vector3; customers: number }[];
}

export function buildBelgium(cities: CityLight[], sprite: THREE.Texture, density: number): BelgiumMap {
  const root = new THREE.Group();
  const outline = BELGIUM.map(([lon, lat]) => project(lat, lon));

  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const land = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: "#0a2244", transparent: true, opacity: 0, depthWrite: false }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.6;
  const borderMat = new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0, toneMapped: false });
  const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map((p) => new THREE.Vector3(p.x, -0.5, p.z))), borderMat);
  root.add(land, border);

  // (a) 2,000 real synthetic customers, jittered around their city.
  const rand = rng(77);
  const realPos: number[] = [];
  const realCol: number[] = [];
  const anchors = cities.map((c) => ({ city: c.city, pos: new THREE.Vector3(project(c.lat, c.lon).x, 0, project(c.lat, c.lon).z), customers: c.customers }));
  for (const c of anchors) {
    for (let i = 0; i < c.customers; i++) {
      const r = 0.6 + Math.sqrt(rand()) * (2.2 + Math.sqrt(c.customers) * 0.12);
      const a = rand() * Math.PI * 2;
      realPos.push(c.pos.x + Math.cos(a) * r, 0.2, c.pos.z + Math.sin(a) * r);
      const col = rand() < 0.85 ? C.warm : C.cool;
      realCol.push(col.r * 2, col.g * 2, col.b * 2);
    }
  }
  const realGeo = new THREE.BufferGeometry();
  realGeo.setAttribute("position", new THREE.Float32BufferAttribute(realPos, 3));
  realGeo.setAttribute("color", new THREE.Float32BufferAttribute(realCol, 3));
  const realMat = new THREE.PointsMaterial({ size: 2.1, map: sprite, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const real = new THREE.Points(realGeo, realMat);
  real.frustumCulled = false;

  // (b) The dense field: everyone the same engine could serve. Weighted by the same cities.
  const fieldCount = Math.round(48000 * density);
  const fieldPos = sampleField(fieldCount, cities.map((c) => ({ lat: c.lat, lon: c.lon, weight: c.customers })), 11);
  const fieldCol: number[] = [];
  for (let i = 0; i < fieldPos.length / 3; i++) {
    const k = rand();
    const col = k < 0.55 ? C.accent : k < 0.85 ? C.cool : C.warm;
    const s = 0.8 + rand() * 1.4;
    fieldCol.push(col.r * s, col.g * s, col.b * s);
  }
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute("position", new THREE.Float32BufferAttribute(fieldPos, 3));
  fieldGeo.setAttribute("color", new THREE.Float32BufferAttribute(fieldCol, 3));
  const fieldMat = new THREE.PointsMaterial({ size: 1.05, map: sprite, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const field = new THREE.Points(fieldGeo, fieldMat);
  field.frustumCulled = false;
  root.add(field, real);

  return {
    root,
    cityAnchors: anchors,
    apply(map, realLights, fieldLevel, t) {
      root.visible = map > 0.001;
      (land.material as THREE.MeshBasicMaterial).opacity = 0.85 * map;
      borderMat.opacity = 0.55 * map;
      realMat.opacity = realLights;
      realMat.size = 2.1 * (0.92 + 0.08 * Math.sin(t * 1.7));
      fieldMat.opacity = 0.75 * fieldLevel;
    },
  };
}
