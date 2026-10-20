"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { renderQuality } from "../picker/capability";
import { loadCharacters } from "../picker/characterGltf";
import type { Character, CharacterId } from "../picker/characterTypes";
import { BUILD_PHASES, buildDiorama, phasesForStep, pickerKit } from "../picker/dioramas";
import type { Diorama } from "../picker/dioramaTypes";

// The build stage: the player's own diorama (same procedural scene as the picker, built with
// `phased: true`) grows piece by piece as plan steps are accepted. Vanilla three.js in one effect,
// same render setup as PickerCanvas (ACES, hemisphere + key + rim, bloom over an MSAA target, no
// shadow maps, no point lights). Text stays in the DOM.
//
// Build timeline and easing adapted from the Exyro diagnostic intro (Diagnostic-Exyro,
// src/three/building.js `springOut` / `animateBuild` and src/intro/scene.js: floors drop in one by
// one with a small bounce, windows light up, the building turns to face the viewer). Reuse confirmed
// with the organisers; colours are the KBC tokens.

export interface BuildCanvasProps {
  persona: "house" | "business";
  /** Step ids in journey order: step i owns build phases `phasesForStep(i, steps.length, phases)`. */
  steps: string[];
  accepted: string[];
  skipped: string[];
  /** A disruption hitting the plan: the affected step (null = the whole building) and a nonce. */
  hit: { step: string | null; n: number } | null;
  /** Number of disruptions resolved so far: every increment repairs the damaged part. */
  repaired: number;
  finale: boolean;
  onFail?: () => void;
}

const NIGHT = "#021e43";
const KATE = "#55c7df";
const RED = "#d4213d";
const WARM = "#ffc98a";
const PERSON: Record<BuildCanvasProps["persona"], CharacterId> = { house: "thomas", business: "lina" };
const DROP_S = 0.7; // one piece's drop (Exyro: 0.7 s per floor)
const DROP_H = 3; // from this far above its place
const LAND_K = 0.42; // springOut first crosses 1 here: the piece touches down
const HIT_S = 0.9;
const REPAIR_S = 0.7;
const SAG = -0.07; // a damaged piece sits this much lower until it is repaired
const CAM_LOOK = new THREE.Vector3(0, 1.0, 0);
const CAM_DIST = 7.0;
const CAM_ELEV = 0.36; // radians above the horizon

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
/** Exyro's springOut: overshoots once, settles. 1 for t >= 1. */
export const springOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 1.2));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Mode = "ghost" | "skipped" | "drop" | "built";

interface Part {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  original: Map<THREE.Mesh, THREE.Material>;
  centre: THREE.Vector3; // local to the root
  bottom: number;
  mode: Mode;
  t0: number; // drop start (ms)
  landed: boolean;
  sag: number; // current extra y (damage)
  sagFrom: number; // repair: spring from here back to 0
  repairT0: number;
}

export default function BuildCanvas(props: BuildCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    const quality = renderQuality(window.location.search);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !quality.bloom, powerPreference: "high-performance", alpha: true });
    } catch {
      live.current.onFail?.();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, quality.bloom ? 1 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.style.display = "block";
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT);
    scene.fog = new THREE.Fog(NIGHT, 9, 16);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

    scene.add(new THREE.HemisphereLight("#6f8fc4", "#0a1426", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 2.2);
    key.position.set(4, 7, 6);
    const rim = new THREE.DirectionalLight("#7fb2ff", 0.8);
    rim.position.set(-6, 4, -5);
    scene.add(key, rim);

    const floorTex = radialTexture([[0, "#143a6b"], [0.1, "#0d2a50"], [0.32, "#04214a"], [1, NIGHT]]);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshBasicMaterial({ map: floorTex, toneMapped: false, fog: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.34;
    scene.add(floor);

    // ── The diorama, in build phases
    const kit = pickerKit({ fontFamily: getComputedStyle(document.body).fontFamily });
    const persona = live.current.persona;
    const d: Diorama = buildDiorama(persona, kit, { phased: true });
    const turntable = new THREE.Group();
    turntable.add(d.root);
    scene.add(turntable);
    d.setFocus(0.55); // the windows glow fully only at the finale

    const ghostMat = new THREE.MeshBasicMaterial({ color: KATE, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, fog: true });
    const skippedMat = new THREE.MeshBasicMaterial({ color: "#45658f", wireframe: true, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false });
    const hitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false });
    const box = new THREE.Box3();
    const parts: Part[] = (d.parts ?? []).map((group) => {
      const meshes: THREE.Mesh[] = [];
      const original = new Map<THREE.Mesh, THREE.Material>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          meshes.push(o);
          original.set(o, o.material as THREE.Material);
        }
      });
      group.updateWorldMatrix(true, true);
      box.makeEmpty();
      for (const m of meshes) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
      const centre = box.isEmpty() ? new THREE.Vector3(0, 0.5, 0) : box.getCenter(new THREE.Vector3());
      // mode starts as "built" (the meshes carry their real materials); setMode(…, "ghost") below swaps them.
      return { group, meshes, original, centre, bottom: box.isEmpty() ? 0 : box.min.y, mode: "built", t0: 0, landed: true, sag: 0, sagFrom: 0, repairT0: -1 };
    });
    const phaseCount = BUILD_PHASES[persona] ?? parts.length;
    const partsOfStep = (id: string): Part[] => {
      const i = live.current.steps.indexOf(id);
      return phasesForStep(i, live.current.steps.length, phaseCount).map((n) => parts[n - 1]).filter(Boolean);
    };

    const setMode = (p: Part, mode: Mode) => {
      if (p.mode === mode) return;
      p.mode = mode;
      for (const m of p.meshes) {
        const orig = p.original.get(m)!;
        const glowOnly = orig.userData.lockAs === "hide" || m.userData.noLock; // light pools, steam
        if (mode === "built" || mode === "drop") {
          m.material = orig;
          m.visible = true;
        } else {
          m.material = mode === "skipped" ? skippedMat : ghostMat;
          m.visible = !glowOnly;
        }
      }
    };
    for (const p of parts) setMode(p, "ghost");

    // ── The person (optional, async): drops in once the plan is complete, cheers at the finale.
    let person: Character | null = null;
    let personAt = -1; // drop start
    let cheerAt = -1;
    loadCharacters([PERSON[persona]])
      .then((map) => {
        if (disposed) return map.forEach((c) => c.dispose());
        const c = map.get(PERSON[persona]);
        if (!c) return;
        c.root.visible = false;
        d.stand.add(c.root);
        person = c;
        renderer.compile(scene, camera);
      })
      .catch(() => undefined);

    // ── Dust / sparks: one Points cloud, per-particle colour and life in attributes.
    const MAXP = 96;
    const pPos = new Float32Array(MAXP * 3);
    const pVel = new Float32Array(MAXP * 3);
    const pCol = new Float32Array(MAXP * 3);
    const pLife = new Float32Array(MAXP); // 1 → 0, <= 0 dead
    const pAge = new Float32Array(MAXP);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("aColor", new THREE.BufferAttribute(pCol, 3));
    pGeo.setAttribute("aLife", new THREE.BufferAttribute(pLife, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sparkTexture() }, uDpr: { value: dpr } },
      vertexShader: `attribute vec3 aColor; attribute float aLife; varying vec3 vC; varying float vL;
        uniform float uDpr;
        void main(){ vC = aColor; vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (14.0 + 10.0 * (1.0 - aLife)) * uDpr * (6.0 / max(-mv.z, 0.5)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vL;
        void main(){ if (vL <= 0.0) discard; float a = texture2D(uTex, gl_PointCoord).a * vL; gl_FragColor = vec4(vC * (0.6 + 1.2 * vL), a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    d.root.add(points);
    const tmpC = new THREE.Color();
    const burst = (at: THREE.Vector3, n: number, colour: string, spread: number, up: number) => {
      tmpC.set(colour);
      let placed = 0;
      for (let i = 0; i < MAXP && placed < n; i++) {
        if (pLife[i] > 0) continue;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random();
        pPos[i * 3] = at.x + Math.cos(a) * r * 0.1;
        pPos[i * 3 + 1] = at.y + 0.02;
        pPos[i * 3 + 2] = at.z + Math.sin(a) * r * 0.1;
        pVel[i * 3] = Math.cos(a) * spread * (0.4 + Math.random());
        pVel[i * 3 + 1] = up * (0.3 + Math.random());
        pVel[i * 3 + 2] = Math.sin(a) * spread * (0.4 + Math.random());
        pCol[i * 3] = tmpC.r;
        pCol[i * 3 + 1] = tmpC.g;
        pCol[i * 3 + 2] = tmpC.b;
        pLife[i] = 1;
        pAge[i] = 0.45 + Math.random() * 0.35;
        placed++;
      }
    };
    const tickParticles = (dt: number) => {
      let any = false;
      for (let i = 0; i < MAXP; i++) {
        if (pLife[i] <= 0) continue;
        any = true;
        pLife[i] -= dt / pAge[i];
        pVel[i * 3 + 1] -= 2.4 * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.01) {
          pPos[i * 3 + 1] = 0.01;
          pVel[i * 3 + 1] *= -0.3;
        }
      }
      points.visible = any;
      if (any) {
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.aLife.needsUpdate = true;
        pGeo.attributes.aColor.needsUpdate = true;
      }
    };

    // ── Bloom, as in the picker (default on; ?bloom=0 to skip).
    const target = quality.bloom ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }) : null;
    const composer = target ? new EffectComposer(renderer, target) : null;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.86);
    if (composer) {
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    // ── Camera: fits the whole plinth (3.6 wide, 3.3 tall) whatever the column's aspect.
    const view = { w: 1, h: 1 };
    const camBase = new THREE.Vector3();
    const fit = () => {
      const aspect = view.w / view.h;
      camera.aspect = aspect;
      const tanHalf = Math.max(3.4 / 2 / CAM_DIST, 3.7 / 2 / CAM_DIST / aspect);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      composer?.setPixelRatio(dpr);
      composer?.setSize(w, h);
      bloom.resolution.set((w * dpr) / 4, (h * dpr) / 4);
      view.w = w;
      view.h = h;
      fit();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const onLost = (e: Event) => {
      e.preventDefault();
      live.current.onFail?.();
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);

    // ── Diff the props every frame (cheap: a few ids) and start the animations they imply.
    const seenAccepted = new Set<string>();
    const seenSkipped = new Set<string>();
    let seenHit = -1;
    let seenRepaired = live.current.repaired;
    let hitParts: Part[] = [];
    let hitT0 = -1;
    let finaleT0 = -1;
    let planDone = false;
    let dropQueue: { part: Part; at: number }[] = [];
    const stats = { fps: 0, frames: 0, since: performance.now() };
    (window as unknown as { __build?: typeof stats }).__build = stats;

    const sync = (now: number) => {
      const p = live.current;
      // First render: anything already decided is placed without animation (deep links, remounts).
      const initial = seenAccepted.size === 0 && seenSkipped.size === 0 && (p.accepted.length + p.skipped.length > 1 || p.finale);
      let delay = 0;
      for (const id of p.accepted) {
        if (seenAccepted.has(id)) continue;
        seenAccepted.add(id);
        for (const part of partsOfStep(id)) {
          if (part.mode === "built" || part.mode === "drop") continue;
          if (initial) {
            setMode(part, "built");
            part.group.position.y = 0;
          } else {
            dropQueue.push({ part, at: now + delay });
            delay += 140; // several pieces for one step: a quick cascade
          }
        }
      }
      for (const id of p.skipped) {
        if (seenSkipped.has(id)) continue;
        seenSkipped.add(id);
        for (const part of partsOfStep(id)) if (part.mode !== "built") setMode(part, "skipped");
      }
      // A step that went back to pending (the customer pressed back): ghost again.
      for (const id of [...seenAccepted]) {
        if (p.accepted.includes(id)) continue;
        seenAccepted.delete(id);
        for (const part of partsOfStep(id)) {
          dropQueue = dropQueue.filter((q) => q.part !== part);
          setMode(part, "ghost");
          part.group.position.y = 0;
        }
      }
      for (const id of [...seenSkipped]) {
        if (p.skipped.includes(id)) continue;
        seenSkipped.delete(id);
        for (const part of partsOfStep(id)) if (part.mode === "skipped") setMode(part, "ghost");
      }
      const done = p.steps.length > 0 && p.accepted.length + p.skipped.length >= p.steps.length;
      if (done && !planDone) {
        planDone = true;
        personAt = initial ? -2 : now + 400; // -2: place without the drop
      }
      if (!done && planDone) {
        planDone = false;
        if (person) person.root.visible = false;
        personAt = -1;
      }
      if (p.hit && p.hit.n !== seenHit) {
        seenHit = p.hit.n;
        const target = p.hit.step ? partsOfStep(p.hit.step).filter((x) => x.mode === "built") : [];
        hitParts = target.length ? target : parts.filter((x) => x.mode === "built").slice(-2);
        hitT0 = now;
        for (const part of hitParts) {
          part.sag = SAG;
          part.repairT0 = -1;
          burst(part.centre, 14, RED, 1.1, 1.4);
        }
      }
      if (p.repaired !== seenRepaired) {
        seenRepaired = p.repaired;
        for (const part of parts) {
          if (part.sag === 0) continue;
          part.sagFrom = part.sag;
          part.repairT0 = now;
          burst(part.centre, 16, KATE, 0.9, 1.8);
        }
        hitT0 = -1;
      }
      if (p.finale && finaleT0 < 0) {
        finaleT0 = now;
        cheerAt = now + 500;
      }
      if (!p.finale) finaleT0 = -1;
    };

    let last = performance.now();
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      sync(now);

      // Pieces drop in with Exyro's springOut; dust when they touch down.
      for (const q of dropQueue) {
        if (now < q.at) continue;
        setMode(q.part, "drop");
        q.part.t0 = now;
        q.part.landed = false;
      }
      dropQueue = dropQueue.filter((q) => now < q.at);
      for (const part of parts) {
        if (part.mode === "drop") {
          const k = clamp01((now - part.t0) / (DROP_S * 1000));
          part.group.position.y = (1 - springOut(k)) * DROP_H;
          if (!part.landed && k >= LAND_K) {
            part.landed = true;
            burst(new THREE.Vector3(part.centre.x, part.bottom, part.centre.z), 12, WARM, 0.8, 0.9);
          }
          if (k >= 1) setMode(part, "built");
        } else if (part.mode === "built") {
          if (part.repairT0 >= 0) {
            const k = clamp01((now - part.repairT0) / (REPAIR_S * 1000));
            part.sag = part.sagFrom * (1 - springOut(k));
            if (k >= 1) {
              part.sag = 0;
              part.repairT0 = -1;
            }
          }
          part.group.position.y = part.sag;
        }
      }

      // A hit: red flicker and a jolt on the damaged pieces, the whole scene shudders.
      const hk = hitT0 >= 0 ? clamp01((now - hitT0) / (HIT_S * 1000)) : 1;
      if (hitT0 >= 0) {
        const flash = hk < 0.6 && Math.floor((now - hitT0) / 80) % 2 === 0;
        for (const part of hitParts) {
          for (const m of part.meshes) {
            const orig = part.original.get(m)!;
            if (orig.userData.lockAs === "hide") continue;
            m.material = flash ? hitMat : orig;
          }
          part.group.rotation.z = Math.sin((now - hitT0) * 0.08) * 0.035 * (1 - hk);
        }
        turntable.position.x = Math.sin((now - hitT0) * 0.09) * 0.03 * (1 - hk);
        if (hk >= 1) {
          for (const part of hitParts) {
            for (const m of part.meshes) m.material = part.original.get(m)!;
            part.group.rotation.z = 0;
          }
          turntable.position.x = 0;
          hitT0 = -1;
        }
      }

      // The person arrives when the plan is complete, cheers at the finale.
      if (person) {
        if (personAt === -2) {
          person.root.visible = true;
          person.root.position.y = 0;
          personAt = -3;
        } else if (personAt >= 0 && now >= personAt) {
          const k = clamp01((now - personAt) / 700);
          if (!person.root.visible) {
            person.root.visible = true;
            person.setPose("wave");
          }
          person.root.position.y = (1 - springOut(k)) * 2;
          if (k >= 1) {
            personAt = -3;
            burst(d.stand.position, 10, WARM, 0.6, 0.8);
          }
        }
        if (person.root.visible) person.update(t, dt);
        if (cheerAt >= 0 && now >= cheerAt && person.root.visible) {
          person.setPose("cheer");
          cheerAt = now + 2600;
        }
      }

      // Turntable: a slow sway while it builds, then it turns to face the viewer (Exyro's FACE beat).
      const fk = finaleT0 >= 0 ? easeInOut(clamp01((now - finaleT0) / 1100)) : 0;
      turntable.rotation.y = (-0.32 + Math.sin(t * 0.22) * 0.14) * (1 - fk) + -0.08 * fk;
      d.setFocus(0.55 + 1.05 * easeOut(fk));
      d.update(t, dt);
      tickParticles(dt);

      // Camera: slightly above, and it walks in a little for the finale.
      const dist = CAM_DIST - 0.9 * fk;
      camBase.set(Math.sin(0.08) * dist, Math.sin(CAM_ELEV) * dist + 0.2, Math.cos(CAM_ELEV) * dist);
      camera.position.copy(camBase);
      camera.lookAt(CAM_LOOK);

      if (composer) composer.render();
      else renderer.render(scene, camera);

      stats.frames++;
      if (now - stats.since >= 1000) {
        stats.fps = Math.round((stats.frames * 1000) / (now - stats.since));
        stats.frames = 0;
        stats.since = now;
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      person?.dispose();
      d.dispose();
      kit.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      floorTex.dispose();
      ghostMat.dispose();
      skippedMat.dispose();
      hitMat.dispose();
      pGeo.dispose();
      (pMat.uniforms.uTex.value as THREE.Texture).dispose();
      pMat.dispose();
      target?.dispose();
      bloom.dispose();
      composer?.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      renderer.domElement.remove();
      const w = window as unknown as { __build?: typeof stats };
      if (w.__build === stats) delete w.__build;
    };
  }, []);

  return <div ref={host} className="absolute inset-0 overflow-hidden rounded-[20px]" data-build-canvas />;
}

function sparkTexture(): THREE.CanvasTexture {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
