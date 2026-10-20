import * as THREE from "three";
import { rng } from "../geo";
import { C, type MaterialKit } from "./materials";

// Night miniature of Leuven: a round plinth, a street grid inside the R23 ring road,
// rows of gabled Flemish townhouses with lit windows, and the story's landmarks.

export const SPOTS = {
  lucas: new THREE.Vector3(2.4, 0, 1.6),
  workshop: new THREE.Vector3(3.9, 0, 1.6),
  kbc: new THREE.Vector3(-4.6, 0, -4.2),
  billit: new THREE.Vector3(1.2, 0, -7.4),
  goSolid: new THREE.Vector3(-6.2, 0, 5.2),
  home: new THREE.Vector3(9.4, 0, 9.6),
  mobility: new THREE.Vector3(-12.6, 0, -2.2),
  pension: new THREE.Vector3(3.2, 0, -12.8),
};
const RING_R = 10.8;
const PLINTH_R = 16;

export interface World {
  root: THREE.Group;
  lucasWindow: THREE.Mesh;
  lucasLight: THREE.PointLight;
  kbcBeacon: THREE.Mesh;
  partner: Record<"billit" | "goSolid", { group: THREE.Group; windows: THREE.InstancedMesh; top: THREE.Vector3 }>;
  districts: Record<"home" | "mobility" | "pension", { group: THREE.Group; windows: THREE.InstancedMesh; center: THREE.Vector3 }>;
  tops: { lucas: THREE.Vector3; kbc: THREE.Vector3 };
  update(t: number): void;
  /** Draw only a fraction of the decorative windows (quality presets). */
  setDensity(d: number): void;
}

function gableGeometry(): THREE.BufferGeometry {
  // Unit prism: base 1×1 on the xz plane at y=0, ridge along x at y=0.5.
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 0.5);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}

function reserved(x: number, z: number): boolean {
  for (const k of ["lucas", "workshop", "kbc", "billit", "goSolid"] as const) {
    const s = SPOTS[k];
    if (Math.hypot(x - s.x, z - s.z) < (k === "kbc" ? 1.9 : 1.5)) return true;
  }
  return false;
}

export function buildWorld(m: MaterialKit, density: number, shadows: boolean): World {
  const root = new THREE.Group();
  const rand = rng(2026);

  // Plinth + ground.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PLINTH_R, PLINTH_R + 0.4, 0.8, 96, 1), [m.plinthSide, m.ground, m.plinthSide]);
  plinth.position.y = -0.4;
  plinth.receiveShadow = shadows;
  root.add(plinth);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PLINTH_R + 0.02, 0.03, 6, 160), m.accentGlow);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  root.add(rim);

  // R23 ring road and the Dijle as a dark band.
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_R - 0.45, RING_R + 0.45, 128), m.street);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.receiveShadow = shadows;
  root.add(ring);

  // Street grid inside the ring.
  const streetGeo = new THREE.PlaneGeometry(1, 1);
  streetGeo.rotateX(-Math.PI / 2);
  const streets = new THREE.InstancedMesh(streetGeo, m.street, 40);
  const mat = new THREE.Matrix4();
  let si = 0;
  for (let i = -4; i <= 4; i++) {
    const p = i * 2.2;
    mat.compose(new THREE.Vector3(p, 0.011, 0), new THREE.Quaternion(), new THREE.Vector3(0.38, 1, 2 * Math.sqrt(Math.max(RING_R ** 2 - p * p, 0))));
    streets.setMatrixAt(si++, mat);
    mat.compose(new THREE.Vector3(0, 0.011, p), new THREE.Quaternion(), new THREE.Vector3(2 * Math.sqrt(Math.max(RING_R ** 2 - p * p, 0)), 1, 0.38));
    streets.setMatrixAt(si++, mat);
  }
  streets.count = si;
  streets.receiveShadow = shadows;
  root.add(streets);

  // Townhouses: rows along x in each block, facades facing ±z streets.
  const houses: { x: number; z: number; w: number; d: number; h: number; face: 1 | -1 }[] = [];
  for (let bx = -5; bx < 5; bx++) {
    for (let bz = -5; bz < 5; bz++) {
      const cx = bx * 2.2 + 1.1;
      const cz = bz * 2.2 + 1.1;
      for (const row of [-1, 1] as const) {
        let x = cx - 0.82;
        while (x < cx + 0.82) {
          const w = 0.26 + rand() * 0.2;
          const px = x + w / 2;
          const pz = cz + row * 0.42;
          const r = Math.hypot(px, pz);
          if (r < RING_R - 0.8 && !reserved(px, pz) && rand() < 0.93) {
            houses.push({ x: px, z: pz, w: w * 0.96, d: 0.78, h: 0.55 + rand() * (r < 5 ? 1.4 : 0.9), face: row });
          }
          x += w;
        }
      }
    }
  }
  // Sparse suburbs between the ring and the plinth edge.
  for (let i = 0; i < 170; i++) {
    const a = rand() * Math.PI * 2;
    const r = RING_R + 1 + rand() * (PLINTH_R - RING_R - 2);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const nearDistrict = (["home", "mobility", "pension"] as const).some((k) => Math.hypot(px - SPOTS[k].x, pz - SPOTS[k].z) < 2.6);
    if (!nearDistrict) houses.push({ x: px, z: pz, w: 0.4 + rand() * 0.2, d: 0.55, h: 0.4 + rand() * 0.35, face: rand() < 0.5 ? 1 : -1 });
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(box, m.wall, houses.length);
  const roofs = new THREE.InstancedMesh(gableGeometry(), m.roof, houses.length);
  const wallTint = new THREE.Color();
  houses.forEach((hs, i) => {
    mat.compose(new THREE.Vector3(hs.x, 0, hs.z), new THREE.Quaternion(), new THREE.Vector3(hs.w, hs.h, hs.d));
    walls.setMatrixAt(i, mat);
    wallTint.setHSL(0.58 + rand() * 0.05, 0.25 + rand() * 0.15, 0.5 + rand() * 0.25);
    walls.setColorAt(i, wallTint);
    mat.compose(new THREE.Vector3(hs.x, hs.h, hs.z), new THREE.Quaternion(), new THREE.Vector3(hs.w, 0.55 + rand() * 0.25, hs.d));
    roofs.setMatrixAt(i, mat);
  });
  walls.castShadow = roofs.castShadow = shadows;
  walls.receiveShadow = shadows;
  root.add(walls, roofs);

  // Lit windows: tiny unlit quads on the street-facing facades. Density follows the quality preset.
  const winGeo = new THREE.PlaneGeometry(0.07, 0.11);
  const winSpots: { pos: THREE.Vector3; rotY: number; color: THREE.Color }[] = [];
  for (const hs of houses) {
    const floors = Math.max(1, Math.floor(hs.h / 0.32));
    for (let f = 0; f < floors; f++) {
      for (const col of [-0.25, 0.25]) {
        if (rand() > 0.62 * density) continue;
        const warm = rand() < 0.82;
        const c = (warm ? C.warm : C.cool).clone().multiplyScalar(0.9 + rand() * 1.6);
        winSpots.push({ pos: new THREE.Vector3(hs.x + col * hs.w, 0.2 + f * 0.3, hs.z + hs.face * (hs.d / 2 + 0.004)), rotY: hs.face === 1 ? 0 : Math.PI, color: c });
      }
    }
  }
  const windows = new THREE.InstancedMesh(winGeo, m.window, winSpots.length);
  winSpots.forEach((w, i) => {
    mat.compose(w.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.rotY), new THREE.Vector3(1, 1, 1));
    windows.setMatrixAt(i, mat);
    windows.setColorAt(i, w.color);
  });
  root.add(windows);

  // Trees along the ring (cheap cones).
  const treeGeo = new THREE.ConeGeometry(0.16, 0.5, 6);
  treeGeo.translate(0, 0.25, 0);
  const trees = new THREE.InstancedMesh(treeGeo, m.tree, 90);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const r = RING_R + (i % 2 ? 0.75 : -0.75);
    mat.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, 0.8 + rand() * 0.5, 1));
    trees.setMatrixAt(i, mat);
  }
  trees.castShadow = shadows;
  root.add(trees);

  // Moving car lights on the ring road.
  const carCount = Math.round(70 * Math.max(density, 0.5));
  const carGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const cars = new THREE.InstancedMesh(carGeo, m.window, carCount);
  const carPhase = Array.from({ length: carCount }, () => rand() * Math.PI * 2);
  const carLane = Array.from({ length: carCount }, (_, i) => (i % 2 ? 1 : -1));
  for (let i = 0; i < carCount; i++) cars.setColorAt(i, (carLane[i] > 0 ? new THREE.Color("#ff5a4f") : C.warm.clone()).multiplyScalar(2.5));
  root.add(cars);

  // Lucas's house: a slightly taller corner townhouse with a big warm window and a desk lamp.
  const lucas = new THREE.Group();
  lucas.position.copy(SPOTS.lucas);
  const lw = new THREE.Mesh(box, m.landmark);
  lw.scale.set(0.7, 1.7, 0.8);
  lw.castShadow = shadows;
  const lr = new THREE.Mesh(gableGeometry(), m.roof);
  lr.scale.set(0.7, 0.65, 0.8);
  lr.position.y = 1.7;
  const lucasWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), m.warmGlow.clone());
  lucasWindow.position.set(0, 1.12, 0.405);
  const lucasLight = new THREE.PointLight(C.warm, 3, 5, 1.6);
  lucasLight.position.set(0, 1.1, 0.9);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshBasicMaterial({ map: glowTexture(), color: C.warm, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.02, 0.5);
  lucas.add(lw, lr, lucasWindow, lucasLight, pool);
  root.add(lucas);

  // Street lamps: warm points along the grid streets with a soft pool each (one draw call each).
  const lampSpots: THREE.Vector3[] = [];
  for (let i = -4; i <= 4; i++) {
    for (let j = -5; j <= 5; j++) {
      const a = new THREE.Vector3(i * 2.2 + 0.22, 0, j * 2.2 + 1.1);
      const b = new THREE.Vector3(j * 2.2 + 1.1, 0, i * 2.2 + 0.22);
      for (const p of [a, b]) if (Math.hypot(p.x, p.z) < RING_R - 0.6 && rand() < 0.55 * Math.max(density, 0.5)) lampSpots.push(p);
    }
  }
  const lampHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), m.warmGlow, lampSpots.length);
  const lampPool = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: C.warm, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), lampSpots.length);
  lampSpots.forEach((p, i) => {
    mat.makeTranslation(p.x, 0.32, p.z);
    lampHead.setMatrixAt(i, mat);
    mat.makeTranslation(p.x, 0.015, p.z);
    lampPool.setMatrixAt(i, mat);
  });
  root.add(lampHead, lampPool);

  // KBC tower: setback shaft, accent crown band, beacon.
  const kbc = new THREE.Group();
  kbc.position.copy(SPOTS.kbc);
  const shaft = new THREE.Mesh(box, m.landmark);
  shaft.scale.set(1.3, 4.6, 1.3);
  const upper = new THREE.Mesh(box, m.landmark);
  upper.scale.set(0.95, 1.2, 0.95);
  upper.position.y = 4.6;
  const crown = new THREE.Mesh(box, m.accentGlow);
  crown.scale.set(1.0, 0.14, 1.0);
  crown.position.y = 5.65;
  const fins = new THREE.InstancedMesh(box, m.accentGlow, 4);
  [[-0.76, -0.76], [0.76, -0.76], [-0.76, 0.76], [0.76, 0.76]].forEach(([x, z], i) => {
    mat.compose(new THREE.Vector3(x * 0.86, 0, z * 0.86), new THREE.Quaternion(), new THREE.Vector3(0.035, 4.6, 0.035));
    fins.setMatrixAt(i, mat);
  });
  const kbcBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 8), m.accentGlow.clone());
  kbcBeacon.position.y = 6.05;
  shaft.castShadow = upper.castShadow = shadows;
  kbc.add(shaft, upper, crown, fins, kbcBeacon, towerWindows(m, 4.6, 1.3, rand));
  root.add(kbc);

  const partner = {
    billit: officeBlock(m, SPOTS.billit, 1.7, 3.2, shadows, rand),
    goSolid: officeBlock(m, SPOTS.goSolid, 1.6, 2.6, shadows, rand),
  };
  root.add(partner.billit.group, partner.goSolid.group);

  const districts = {
    home: districtCluster(m, SPOTS.home, "houses", shadows, rand),
    mobility: districtCluster(m, SPOTS.mobility, "station", shadows, rand),
    pension: districtCluster(m, SPOTS.pension, "park", shadows, rand),
  };
  root.add(districts.home.group, districts.mobility.group, districts.pension.group);

  const carMatrix = new THREE.Matrix4();
  return {
    root,
    lucasWindow,
    lucasLight,
    kbcBeacon,
    partner,
    districts,
    tops: { lucas: SPOTS.lucas.clone().setY(2.3), kbc: SPOTS.kbc.clone().setY(6.1) },
    setDensity(d: number) {
      windows.count = Math.max(1, Math.floor(winSpots.length * Math.min(1, d / Math.max(density, 0.01))));
    },
    update(t: number) {
      for (let i = 0; i < carCount; i++) {
        const a = carPhase[i] + t * 0.06 * carLane[i];
        const r = RING_R + carLane[i] * 0.2;
        carMatrix.makeTranslation(Math.cos(a) * r, 0.06, Math.sin(a) * r);
        cars.setMatrixAt(i, carMatrix);
      }
      cars.instanceMatrix.needsUpdate = true;
      const pulse = 0.65 + 0.35 * Math.sin(t * 2.4);
      kbcBeacon.scale.setScalar(0.85 + pulse * 0.3);
    },
  };
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function towerWindows(m: MaterialKit, h: number, w: number, rand: () => number): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(0.16, 0.12);
  const spots: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  for (let side = 0; side < 4; side++) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2);
    for (let y = 0.35; y < h - 0.2; y += 0.28) {
      for (let c = -0.5; c <= 0.5; c += 0.25) {
        if (rand() > 0.55) continue;
        const local = new THREE.Vector3(c * w * 0.9, y, w / 2 + 0.005).applyQuaternion(q);
        spots.push(new THREE.Matrix4().compose(local, q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  const win = new THREE.InstancedMesh(geo, m.window, spots.length);
  spots.forEach((s, i) => {
    win.setMatrixAt(i, s);
    win.setColorAt(i, C.cool.clone().multiplyScalar(1.2 + rand()));
  });
  return win;
}

function officeBlock(m: MaterialKit, at: THREE.Vector3, w: number, h: number, shadows: boolean, rand: () => number) {
  const group = new THREE.Group();
  group.position.copy(at);
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const body = new THREE.Mesh(box, m.dark);
  body.scale.set(w, h, w * 0.8);
  body.castShadow = shadows;
  const cap = new THREE.Mesh(box, m.trim);
  cap.scale.set(w * 1.04, 0.08, w * 0.84);
  cap.position.y = h;
  group.add(body, cap);
  const geo = new THREE.PlaneGeometry(0.18, 0.12);
  const spots: THREE.Matrix4[] = [];
  for (const face of [1, -1]) {
    for (let y = 0.3; y < h - 0.15; y += 0.26) {
      for (let c = -0.4; c <= 0.4; c += 0.2) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face === 1 ? 0 : Math.PI);
        spots.push(new THREE.Matrix4().compose(new THREE.Vector3(c * w, y, face * (w * 0.4 + 0.005)), q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  const windows = new THREE.InstancedMesh(geo, m.window, spots.length);
  spots.forEach((s, i) => {
    windows.setMatrixAt(i, s);
    windows.setColorAt(i, C.cool.clone().multiplyScalar(1.4 + rand() * 0.8));
  });
  windows.visible = false; // dark until consent lights it
  group.add(windows);
  return { group, windows, top: at.clone().setY(h + 0.2) };
}

function districtCluster(m: MaterialKit, at: THREE.Vector3, kind: "houses" | "station" | "park", shadows: boolean, rand: () => number) {
  const group = new THREE.Group();
  group.position.copy(at);
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const lots: { x: number; z: number; w: number; h: number; d: number }[] = [];
  if (kind === "houses") {
    for (let i = 0; i < 9; i++) lots.push({ x: (i % 3) * 0.9 - 0.9, z: Math.floor(i / 3) * 0.9 - 0.9, w: 0.55, h: 0.45 + rand() * 0.25, d: 0.55 });
  } else if (kind === "station") {
    lots.push({ x: 0, z: 0, w: 2.8, h: 0.5, d: 0.9 });
    lots.push({ x: -1.6, z: 1.3, w: 0.8, h: 0.9, d: 0.8 }, { x: 1.4, z: 1.3, w: 0.7, h: 0.7, d: 0.7 });
    const rails = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.02, 0.08), m.trim);
    rails.position.set(0, 0.02, -0.75);
    const rails2 = rails.clone();
    rails2.position.z = -1.0;
    group.add(rails, rails2);
  } else {
    lots.push({ x: 0, z: 0, w: 1.1, h: 1.6, d: 1.1 }, { x: 1.4, z: 0.9, w: 0.7, h: 0.6, d: 0.7 });
    const treeGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(treeGeo, m.tree);
      t.position.set(-1.3 + rand() * 0.6, 0.3, -1.2 + i * 0.4);
      group.add(t);
    }
  }
  const winGeo = new THREE.PlaneGeometry(0.08, 0.1);
  const spots: THREE.Matrix4[] = [];
  for (const l of lots) {
    const b = new THREE.Mesh(box, m.wall);
    b.scale.set(l.w, l.h, l.d);
    b.position.set(l.x, 0, l.z);
    b.castShadow = shadows;
    group.add(b);
    for (let y = 0.18; y < l.h - 0.08; y += 0.24) {
      for (let c = -0.3; c <= 0.3; c += 0.3) {
        spots.push(new THREE.Matrix4().makeTranslation(l.x + c * l.w, y, l.z + l.d / 2 + 0.005));
      }
    }
  }
  const windows = new THREE.InstancedMesh(winGeo, m.window, spots.length);
  spots.forEach((s, i) => {
    windows.setMatrixAt(i, s);
    windows.setColorAt(i, C.warm.clone().multiplyScalar(1.4 + rand()));
  });
  windows.visible = false;
  group.add(windows);
  return { group, windows, center: at.clone() };
}
