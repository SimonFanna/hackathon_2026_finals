import * as THREE from "three";
import { C, type MaterialKit } from "./materials";
import { SPOTS, type World } from "./world";

// Story effects driven by director levels (0..1 or step counts). Each `apply` is idempotent.

export interface Effects {
  root: THREE.Group;
  /** signals: 0..1 reveal; kate: 0..1 ring fill; build: 0..6 steps; consent: 0..1; districts: 0..3 */
  apply(l: Levels, t: number, dt: number): void;
}
export interface Levels {
  lucas: number; signals: number; kate: number; build: number; consent: number; districts: number;
  map: number; realLights: number; field: number;
}

const bezier = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
};

export function buildEffects(world: World, m: MaterialKit, signalCount: number, density: number): Effects {
  const root = new THREE.Group();

  // ── Signals: arcs from Lucas's house to the KBC tower, one travelling pulse per real signal.
  const arcs = Array.from({ length: signalCount }, (_, i) => {
    const spread = (i / Math.max(signalCount - 1, 1) - 0.5) * 2; // -1..1
    const from = world.tops.lucas.clone().add(new THREE.Vector3(spread * 0.25, 0, 0));
    const to = world.tops.kbc.clone().add(new THREE.Vector3(0, -0.3, 0));
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(spread * 2.4, 2.6 + Math.abs(spread) * 1.2, -spread * 1.6));
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  });
  const arcMat = new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0, toneMapped: false });
  const arcLines = arcs.map((c) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(48)), arcMat);
    root.add(line);
    return line;
  });
  const pulseGeo = new THREE.SphereGeometry(0.09, 12, 8);
  const pulses = new THREE.InstancedMesh(pulseGeo, m.accentGlow, signalCount * 3);
  pulses.frustumCulled = false;
  root.add(pulses);

  // ── Kate: a ring above Lucas's house that fills to the "ask" zone, with zone ticks.
  const kateGroup = new THREE.Group();
  kateGroup.position.copy(world.tops.lucas).add(new THREE.Vector3(0, 1.1, 0));
  kateGroup.scale.setScalar(0.8);
  const track = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 96), new THREE.MeshBasicMaterial({ color: C.kate, transparent: true, opacity: 0.18, side: THREE.DoubleSide, toneMapped: false }));
  const fill = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, 96, 1, Math.PI / 2, 0.0001), m.kateGlow);
  const ticks = new THREE.Group();
  for (const z of [0.4, 0.75]) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    const a = Math.PI / 2 - z * Math.PI * 2;
    tick.position.set(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0);
    tick.rotation.z = a - Math.PI / 2;
    ticks.add(tick);
  }
  kateGroup.add(track, fill, ticks);
  root.add(kateGroup);

  // ── Workshop: slab → scaffold → crane → walls → glass → sign, with spark bursts per step.
  const shop = new THREE.Group();
  shop.position.copy(SPOTS.workshop);
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const slab = new THREE.Mesh(box, m.trim);
  slab.scale.set(1.5, 0.06, 1.1);
  const scaffoldGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.4, 1.1, 3, 3, 2));
  scaffoldGeo.translate(0, 0.7, 0);
  const scaffold = new THREE.LineSegments(scaffoldGeo, new THREE.LineBasicMaterial({ color: "#9fb6d4", transparent: true, opacity: 0.85 }));
  const crane = new THREE.Group();
  const mast = new THREE.Mesh(box, m.trim);
  mast.scale.set(0.08, 2.6, 0.08);
  mast.position.set(-0.9, 0, -0.7);
  const jib = new THREE.Mesh(box, m.trim);
  jib.scale.set(1.9, 0.07, 0.07);
  jib.position.set(-0.3, 2.55, -0.7);
  const craneLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff5a4f").multiplyScalar(3), toneMapped: false }));
  craneLight.position.set(0.62, 2.62, -0.7);
  crane.add(mast, jib, craneLight);
  const walls = new THREE.Mesh(box, m.landmark);
  walls.scale.set(1.4, 1.1, 1.0);
  walls.castShadow = true;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ color: C.warm.clone().multiplyScalar(0.85), toneMapped: false }));
  const mullions = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.62, 0.02), m.trim, 5);
  for (let i = 0; i < 5; i++) mullions.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-0.6 + i * 0.3, 0.45, 0.515));
  glass.position.set(0, 0.45, 0.505);
  const sign = new THREE.Mesh(box, m.accentGlow);
  sign.scale.set(1.0, 0.07, 0.04);
  sign.position.set(0, 0.92, 0.52);
  shop.add(slab, scaffold, crane, walls, glass, mullions, sign);
  root.add(shop);

  const sparkCount = Math.round(160 * Math.max(density, 0.4));
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkVel = new Float32Array(sparkCount * 3);
  const sparkLife = new Float32Array(sparkCount);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: C.warm.clone().multiplyScalar(3), size: 0.07, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  root.add(sparks);
  let lastBuildStep = 0;
  const burst = (origin: THREE.Vector3) => {
    for (let i = 0; i < sparkCount; i++) {
      sparkPos.set([origin.x, origin.y, origin.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.6;
      sparkVel.set([Math.cos(a) * s, 1.5 + Math.random() * 2.2, Math.sin(a) * s], i * 3);
      sparkLife[i] = 0.6 + Math.random() * 0.6;
    }
  };

  // ── Consent beams: Lucas → Billit lights it; Go Solid gets no beam.
  const beamCurve = bezier(world.tops.lucas, world.partner.billit.top, 2.2);
  const beam = new THREE.Mesh(new THREE.TubeGeometry(beamCurve, 64, 0.045, 8, false), new THREE.MeshBasicMaterial({ color: C.accent.clone().multiplyScalar(2.4), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beamHalo = new THREE.Mesh(new THREE.TubeGeometry(beamCurve, 64, 0.14, 8, false), new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beamPulse = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), m.accentGlow);
  root.add(beam, beamHalo, beamPulse);
  const declined = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.9, 64), new THREE.MeshBasicMaterial({ color: "#7d8fa8", transparent: true, opacity: 0, side: THREE.DoubleSide }));
  declined.rotation.x = -Math.PI / 2;
  declined.position.copy(SPOTS.goSolid).setY(0.03);
  root.add(declined);

  // ── District ripples (one ring each, expanding when the district lights up).
  const rippleMat = () => new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  const ripples = (["home", "mobility", "pension"] as const).map((k) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), rippleMat());
    r.rotation.x = -Math.PI / 2;
    r.position.copy(world.districts[k].center).setY(0.03);
    root.add(r);
    return r;
  });
  const rippleT = [0, 0, 0];

  let lastFill = -1;
  const tmp = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return {
    root,
    apply(l, t, dt) {
      // Lucas glow (beat 0 onwards).
      (world.lucasWindow.material as THREE.MeshBasicMaterial).color.copy(C.warm).multiplyScalar(0.6 + 2.2 * l.lucas);
      world.lucasLight.intensity = 3 * l.lucas;

      // Signals.
      arcMat.opacity = 0.35 * l.signals;
      arcLines.forEach((line) => (line.visible = l.signals > 0.01));
      let n = 0;
      if (l.signals > 0.01) {
        arcs.forEach((curve, i) => {
          for (let k = 0; k < 3; k++) {
            const u = (t * 0.22 + i * 0.137 + k / 3) % 1;
            curve.getPoint(u, v);
            const s = Math.sin(u * Math.PI) * l.signals;
            tmp.compose(v, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
            pulses.setMatrixAt(n++, tmp);
          }
        });
      }
      pulses.count = n;
      pulses.instanceMatrix.needsUpdate = true;
      world.kbcBeacon.scale.multiplyScalar(1 + 0.6 * l.signals);

      // Kate ring.
      kateGroup.visible = l.kate > 0.001;
      kateGroup.quaternion.copy(cameraFacing);
      const filled = 0.6 * Math.min(l.kate, 1);
      if (Math.abs(filled - lastFill) > 0.002) {
        lastFill = filled;
        fill.geometry.dispose();
        fill.geometry = new THREE.RingGeometry(0.58, 0.72, 96, 1, Math.PI / 2 - filled * Math.PI * 2, Math.max(filled * Math.PI * 2, 0.0001));
      }
      (track.material as THREE.MeshBasicMaterial).opacity = 0.18 * l.kate;
      m.kateGlow.opacity = Math.min(1, l.kate * 1.5);

      // Workshop stages.
      const b = l.build;
      slab.visible = b > 0.05;
      scaffold.visible = b > 0.9 && b < 5.6;
      crane.visible = b > 1.6 && b < 5.8;
      walls.visible = b > 2.4;
      walls.scale.y = 1.1 * THREE.MathUtils.clamp((b - 2.4) / 1.2, 0.02, 1);
      glass.visible = b > 3.8;
      mullions.visible = b > 3.8;
      sign.visible = b > 4.8;
      const step = Math.floor(b + 0.001);
      if (step > lastBuildStep && step <= 6) burst(SPOTS.workshop.clone().setY(0.9));
      lastBuildStep = step;
      for (let i = 0; i < sparkCount; i++) {
        if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -50; continue; }
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      // Consent.
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.9 * l.consent;
      (beamHalo.material as THREE.MeshBasicMaterial).opacity = 0.18 * l.consent;
      beamPulse.visible = l.consent > 0.05;
      beamCurve.getPoint((t * 0.45) % 1, beamPulse.position);
      world.partner.billit.windows.visible = l.consent > 0.6;
      (declined.material as THREE.MeshBasicMaterial).opacity = 0.55 * l.consent;
      world.partner.goSolid.windows.visible = false;

      // Districts.
      (["home", "mobility", "pension"] as const).forEach((k, i) => {
        const on = l.districts > i + 0.5;
        world.districts[k].windows.visible = on;
        if (on) rippleT[i] = Math.min(rippleT[i] + dt * 0.5, 1);
        else rippleT[i] = 0;
        const r = ripples[i];
        r.scale.setScalar(0.5 + rippleT[i] * 3.2);
        (r.material as THREE.MeshBasicMaterial).opacity = on ? 0.8 * (1 - rippleT[i]) + 0.12 : 0;
      });
    },
  };
}

/** Set by main every frame so billboards (Kate ring) face the camera. */
export const cameraFacing = new THREE.Quaternion();
