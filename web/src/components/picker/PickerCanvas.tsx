"use client";

import { LockSimple } from "@phosphor-icons/react";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { dragFocus, indexOfId, layout, releaseTarget, type PlayableId } from "./carousel";
import { buildDiorama, pickerKit } from "./dioramaSource";
import { loadCharacters } from "./characterGltf";
import type { Character, CharacterId } from "./characterTypes";
import type { Diorama, DioramaId } from "./dioramaTypes";
import type { ScreenRect } from "./handoff";

// The 3D carousel. Vanilla three.js inside one effect (like pitch3d): no lights that cost per pixel,
// no shadow maps, shared materials, half-resolution bloom that switches off if the GPU struggles.
// Text stays in the DOM (sharp on a projector, accessible); the canvas only draws the dioramas.

export interface PickerItem { id: DioramaId; label: string; locked: boolean; title?: string }
export type DiveFn = (id: PlayableId, onCover: (ms: number, window: ScreenRect) => void) => Promise<void>;
/** The free space between the headline and the player card, in px from the top of the canvas. */
export interface Band { top: number; bottom: number }

export interface PickerCanvasProps {
  items: PickerItem[];
  selected: PlayableId;
  onSelect: (id: PlayableId) => void;
  onActivate: (id: PlayableId) => void;
  onReady: () => void;
  onFail: (reason: "fps" | "context" | "init") => void;
  diveRef: MutableRefObject<DiveFn | null>;
  reduce: boolean;
  band: Band | null;
}

const NIGHT = "#021e43";
const PERSON: Record<DioramaId, CharacterId> = { house: "thomas", business: "lina", retire: "retiree", baby: "parent", car: "driver" };
const CAM_POS = new THREE.Vector3(0, 2.9, 11.9);
const CAM_LOOK = new THREE.Vector3(0, 0.5, -1.4);
// Framing: the stage (roof tops to the plinth's front edge) is fitted into the free band.
const STAGE_TOP = 2.65;
const STAGE_BOTTOM = -0.34;
const BAND_MARGIN = 6;
const CARD_GAP = 16; // Band.bottom sits this far above the card
// Dive: fly onto the window's axis and stop where it fills most of the screen height.
const FLY_MS = 950;
const SETTLE_MS = 350;
const END_FOV = 26;
const WINDOW_FILL = 0.86;
const ease = {
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};

export default function PickerCanvas(props: PickerCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const captions = useRef<(HTMLDivElement | null)[]>([]);
  const activateRef = useRef<(i: number) => void>(() => {});
  // Latest props for the render loop without re-running the effect.
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      // Native MSAA, no post-processing by default: crisp edges and 55–60 fps on an integrated GPU.
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      live.current.onFail("init");
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.style.display = "block";
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT);
    scene.fog = new THREE.Fog(NIGHT, 12.5, 19.5); // the neighbours recede into the night
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    camera.position.copy(CAM_POS);
    camera.lookAt(CAM_LOOK);

    scene.add(new THREE.HemisphereLight("#6f8fc4", "#0a1426", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 2.2);
    key.position.set(4, 7, 6);
    const rim = new THREE.DirectionalLight("#7fb2ff", 0.8);
    rim.position.set(-6, 4, -5);
    scene.add(key, rim);

    // Stage floor: a soft pool of light under the centred scene (one unlit canvas gradient, exact colours).
    const floorTex = radialTexture([[0, "#143a6b"], [0.1, "#0d2a50"], [0.32, "#04214a"], [1, NIGHT]]);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), new THREE.MeshBasicMaterial({ map: floorTex, toneMapped: false, fog: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.34, 0);
    scene.add(floor);

    const kit = pickerKit({ fontFamily: getComputedStyle(document.body).fontFamily });
    const items = live.current.items;
    const dioramas: Diorama[] = [];
    const holders: THREE.Group[] = [];
    items.forEach((it, i) => {
      const d = buildDiorama(it.id, kit);
      d.setLocked(it.locked);
      const holder = new THREE.Group();
      holder.userData.index = i;
      holder.add(d.root);
      scene.add(holder);
      dioramas.push(d);
      holders.push(holder);
    });

    // The people: two CC0 rigged models, cloned and recoloured, standing in their scenes (async, optional).
    const people: (Character | null)[] = items.map(() => null);
    const waveAt = items.map(() => 0);
    const waveUntil = items.map(() => -1);
    loadCharacters(items.map((it) => PERSON[it.id]))
      .then((map) => {
        if (disposed) return map.forEach((c) => c.dispose());
        items.forEach((it, i) => {
          const c = map.get(PERSON[it.id]);
          if (!c) return;
          c.setLocked(it.locked);
          dioramas[i].stand.add(c.root);
          people[i] = c;
        });
        renderer.compile(scene, camera); // upload the skinned shaders now, not mid-animation
        calmFrom = Math.max(calmFrom, performance.now() + 2500);
      })
      .catch(() => {
        /* the scenes still work without people */
      });

    // Window halos: one additive sprite per lit window replaces bloom (cheap, no extra render pass).
    const haloTex = haloTexture();
    const halos = dioramas.map((d, i) => {
      const m = new THREE.SpriteMaterial({ map: haloTex, color: "#ffcf96", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(1.25);
      sp.renderOrder = 2;
      sp.visible = !items[i].locked;
      d.window.add(sp);
      sp.position.set(0, 0, 0.06);
      return sp;
    });

    // Optional bloom (?bloom=1) for strong GPUs: half resolution, multisampled half-float target.
    let useBloom = new URLSearchParams(window.location.search).get("bloom") === "1";
    const target = useBloom ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }) : null;
    const composer = target ? new EffectComposer(renderer, target) : null;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.86);
    if (composer) {
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    let calmFrom = performance.now() + 3500; // fps governor ignores start-up, asset uploads and resizes
    let diving = false;
    let diveIndex = -1;
    let diveFade = 0; // 0 → 1 over the dive: the window halo gives way to the window itself
    const view = { w: 1, h: 1, y: 0, key: "" };
    const tmp = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
    const setViewY = (y: number) => {
      camera.setViewOffset(view.w, view.h, 0, y, view.w, view.h);
      camera.updateProjectionMatrix();
    };
    // Fit the stage into the free band (shrink only, never enlarge) and centre it there with a view
    // offset: projection, picking and the DOM overlay all follow the camera, so nothing else changes.
    const fit = () => {
      const { w, h } = view;
      const band = live.current.band;
      const top = band?.top ?? 0;
      const bot = band?.bottom ?? h;
      view.key = `${w}x${h}:${top}:${bot}`;
      const base = w / h < 1.5 ? 36 : 30; // keep the side items in frame on narrower screens
      camera.clearViewOffset();
      camera.aspect = w / h;
      camera.fov = base;
      camera.position.copy(CAM_POS);
      camera.lookAt(CAM_LOOK);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const yT = tmp[0].set(0, STAGE_TOP, 0).project(camera).y;
      const yB = tmp[0].set(0, STAGE_BOTTOM, 1.75).project(camera).y;
      const k = Math.min(1, Math.max(0.4, (bot - top - 2 * BAND_MARGIN) / ((h / 2) * (yT - yB))));
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / k));
      view.y = h / 2 - (h / 2) * k * ((yT + yB) / 2) - (top + bot) / 2;
      setViewY(view.y);
    };
    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      composer?.setPixelRatio(dpr);
      composer?.setSize(w, h);
      calmFrom = Math.max(calmFrom, performance.now() + 1500);
      bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2);
      view.w = w;
      view.h = h;
      if (!diving) fit();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ── State
    let focus = indexOfId(live.current.selected);
    let vel = 0;
    let drag: { id: number; x: number; start: number; moved: boolean; samples: { x: number; t: number }[] } | null = null;
    let dragFocusValue = focus;
    const wiggle = new Array(items.length).fill(0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const pick = (clientX: number, clientY: number): number | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(holders, true)[0];
      if (!hit) return null;
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.index === undefined) o = o.parent;
      return o ? (o.userData.index as number) : null;
    };

    const activate = (i: number) => {
      const it = live.current.items[i];
      if (!it || diving) return;
      if (it.locked) {
        wiggle[i] = 1;
        return;
      }
      const id = it.id as PlayableId;
      if (id === live.current.selected) live.current.onActivate(id);
      else live.current.onSelect(id);
    };

    const canvas = renderer.domElement;
    canvas.style.touchAction = "pan-y";
    const onDown = (e: PointerEvent) => {
      if (diving || e.button !== 0 || !e.isPrimary) return; // left button / first finger only
      drag = { id: e.pointerId, x: e.clientX, start: focus, moved: false, samples: [{ x: e.clientX, t: performance.now() }] };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) dragFocusValue = dragFocus(drag.start, dx, canvas.clientWidth);
        drag.samples.push({ x: e.clientX, t: performance.now() });
        if (drag.samples.length > 6) drag.samples.shift();
        return;
      }
      const i = pick(e.clientX, e.clientY);
      canvas.style.cursor = i != null && !live.current.items[i]?.locked ? "pointer" : i != null ? "not-allowed" : "grab";
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasDrag = drag.moved;
      const first = drag.samples[0];
      const lastS = drag.samples[drag.samples.length - 1];
      const dtS = Math.max((lastS.t - first.t) / 1000, 1 / 120);
      // px/s → items/s, with the same scale as dragFocus (a full width = 4 items, dragging left moves right).
      const velocity = (-(lastS.x - first.x) / dtS / Math.max(canvas.clientWidth, 1)) * 4;
      drag = null;
      if (wasDrag) {
        const id = releaseTarget(dragFocusValue, velocity, live.current.selected);
        focus = dragFocusValue;
        if (id !== live.current.selected) live.current.onSelect(id);
      } else {
        const i = pick(e.clientX, e.clientY);
        if (i != null) activate(i);
      }
    };
    const onCancel = () => {
      if (drag?.moved) focus = dragFocusValue;
      drag = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);

    const onLost = (e: Event) => {
      e.preventDefault();
      live.current.onFail("context");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // Keyboard / screen-reader buttons (DOM, focusable) route here.
    activateRef.current = activate;

    // The window's rectangle on screen (viewport px), for the handoff overlay to light up exactly.
    const screenRect = (m: THREE.Mesh, box: THREE.Box3): ScreenRect => {
      camera.updateMatrixWorld();
      m.updateWorldMatrix(true, false);
      const r = canvas.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of [[box.min.x, box.min.y], [box.max.x, box.min.y], [box.min.x, box.max.y], [box.max.x, box.max.y]]) {
        const p = tmp[5].set(x, y, (box.min.z + box.max.z) / 2).applyMatrix4(m.matrixWorld).project(camera);
        const sx = r.left + (p.x * 0.5 + 0.5) * r.width;
        const sy = r.top + (-p.y * 0.5 + 0.5) * r.height;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
      return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
    };

    // ── Dive: the scene turns to face the camera (the person hops) while the camera flies onto the lit
    // window's axis and eases to a stop where the window fills most of the screen. The handoff overlay
    // then lights that exact rectangle and morphs it into the phone screen.
    live.current.diveRef.current = (id, onCover) =>
      new Promise<void>((resolve) => {
        const i = indexOfId(id);
        const d = dioramas[i];
        if (!d || live.current.reduce) {
          resolve();
          return;
        }
        diving = true;
        diveIndex = i;
        focus = i;
        vel = 0;
        holders.forEach((h) => (h.userData.settle = 0));
        people[i]?.setPose("cheer");
        const start = performance.now();
        const fromPos = camera.position.clone();
        const fromLook = CAM_LOOK.clone();
        const fromFov = camera.fov;
        const fromViewY = view.y;
        const geo = d.window.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const box = geo.boundingBox!;
        let covered = false;
        const step = () => {
          if (disposed) return resolve();
          const t = performance.now() - start;
          holders[i].userData.settle = Math.min(1, t / SETTLE_MS);
          const k = Math.min(1, t / FLY_MS);
          const e = ease.inOutCubic(k);
          const eLook = ease.inOutCubic(Math.min(1, k * 1.3));
          d.window.updateWorldMatrix(true, false);
          const wp = tmp[1].setFromMatrixPosition(d.window.matrixWorld);
          const n = tmp[2].set(0, 0, 1).transformDirection(d.window.matrixWorld);
          const winH = (box.max.y - box.min.y) * tmp[3].setFromMatrixScale(d.window.matrixWorld).y;
          const dist = winH / (WINDOW_FILL * 2 * Math.tan(THREE.MathUtils.degToRad(END_FOV / 2)));
          camera.position.lerpVectors(fromPos, tmp[4].copy(wp).addScaledVector(n, dist), e);
          camera.lookAt(tmp[4].lerpVectors(fromLook, wp, eLook));
          camera.fov = fromFov + (END_FOV - fromFov) * e;
          setViewY(fromViewY * (1 - eLook)); // end centred on screen
          d.setFocus(1 + 0.3 * e); // a little brighter, never clipped: the curtains and lamp stay readable
          diveFade = e;
          if (!covered && k >= 0.92) {
            covered = true;
            onCover(120, screenRect(d.window, box));
          }
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });

    // ── Loop
    const reduceMotion = () => live.current.reduce;
    let last = performance.now();
    const t0 = last;
    const times: number[] = [];
    let lowSince = 0;
    let slowSince = 0;
    let readySent = false;
    const stats = { fps: 60, calls: 0, triangles: 0, bloom: useBloom, people: [] as unknown[] };
    (window as unknown as { __picker?: typeof stats }).__picker = stats;
    const proj = new THREE.Vector3();

    renderer.info.autoReset = false; // count every pass of the composer in one frame
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = (now - t0) / 1000;

      // Focus spring (critically damped), or follow the finger while dragging.
      const target = indexOfId(live.current.selected);
      if (drag?.moved) {
        focus = dragFocusValue;
        vel = 0;
      } else if (!diving) {
        const w = 7.5;
        const acc = -2 * w * vel - w * w * (focus - target);
        vel += acc * dt;
        focus += vel * dt;
        if (reduceMotion()) {
          focus = target;
          vel = 0;
        }
      }

      const r = canvas.getBoundingClientRect();
      holders.forEach((h, i) => {
        const s = layout(i, focus);
        h.position.set(s.x, 0, s.z);
        h.scale.setScalar(s.scale);
        // One neighbour per side at full size; the far ones fade out instead of crowding the frame.
        const far = Math.abs(i - focus);
        h.visible = far < 1.75;
        const spin = reduceMotion() ? 0 : Math.sin(t * 0.32 + i * 1.7) * 0.32 * s.light;
        const settle = (h.userData.settle as number | undefined) ?? 0;
        wiggle[i] = Math.max(0, wiggle[i] - dt * 2.4);
        const shake = wiggle[i] > 0 ? Math.sin(wiggle[i] * 28) * 0.07 * wiggle[i] : 0;
        h.rotation.y = s.rotY + spin * (1 - settle) + shake;
        const d = dioramas[i];
        if (!diving || d !== dioramas[indexOfId(live.current.selected)]) d.setFocus(s.light);
        halos[i].material.opacity = items[i].locked ? 0 : (0.25 + 0.75 * s.light) * (i === diveIndex ? 1 - diveFade : 1);
        d.update(t, dt);
        const person = people[i];
        if (person) {
          person.setFocus(s.light);
          // The centred player greets the camera now and then; everyone else idles.
          const centred = !items[i].locked && Math.abs(i - focus) < 0.12 && !drag?.moved;
          if (!diving) {
            if (centred && waveUntil[i] < 0 && t >= waveAt[i]) {
              person.setPose("wave");
              waveUntil[i] = t + 2.6;
              waveAt[i] = t + 7.5;
            } else if (waveUntil[i] >= 0 && (t >= waveUntil[i] || !centred)) {
              person.setPose("idle");
              waveUntil[i] = -1;
              if (!centred) waveAt[i] = 0; // greet again as soon as it comes back to the centre
            }
          }
          person.update(t, dt);
        }

        // DOM overlay: a focusable button over each diorama + captions under locked ones.
        proj.set(s.x, 1.1 * s.scale, s.z).project(camera);
        const cx = (proj.x * 0.5 + 0.5) * r.width;
        const cy = (-proj.y * 0.5 + 0.5) * r.height;
        const size = (2.9 * s.scale * r.height) / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(h.position));
        const b = buttons.current[i];
        if (b) {
          b.style.visibility = h.visible ? "visible" : "hidden";
          b.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
          b.style.width = b.style.height = `${size}px`;
        }
        const c = captions.current[i];
        if (c) {
          // Centred under its own plinth (x from the plinth centre, y from its front-bottom edge + 10 px),
          // hidden rather than tucked under the player card on short screens.
          const lx = (proj.set(s.x, -0.42 * s.scale, s.z).project(camera).x * 0.5 + 0.5) * r.width;
          const ly = (-proj.set(s.x, -0.42 * s.scale, s.z + 1.75 * s.scale).project(camera).y * 0.5 + 0.5) * r.height + 10;
          c.style.transform = `translate(${lx}px, ${ly}px) translateX(-50%)`;
          const band = live.current.band;
          const clash = !!band && ly + 32 > band.bottom + CARD_GAP;
          c.style.opacity = diving || !h.visible || far > 1.25 || clash ? "0" : String(Math.min(1, 0.5 + s.light));
        }
      });

      if (!diving) {
        const b = live.current.band;
        if (view.key !== `${view.w}x${view.h}:${b?.top ?? 0}:${b?.bottom ?? view.h}`) fit();
        camera.position.copy(CAM_POS);
        camera.lookAt(CAM_LOOK);
      }

      renderer.info.reset();
      if (useBloom && composer) composer.render();
      else renderer.render(scene, camera);
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.people = people.map((c) => (c ? { id: c.id, ...c.root.userData.measured, world: c.root.getWorldPosition(proj.clone()).toArray().map((v) => +v.toFixed(2)) } : null));

      if (!readySent) {
        readySent = true;
        requestAnimationFrame(() => !disposed && live.current.onReady());
      }

      // fps governor: drop bloom first under 45 fps, then hand over to the 2D picker under 30 fps.
      times.push(now);
      while (times.length && now - times[0] > 2000) times.shift();
      if (times.length > 1) stats.fps = Math.round(((times.length - 1) * 1000) / (now - times[0]));
      // Sustained only: a stutter (asset upload, resize, another app) never decides on its own.
      if (now > calmFrom && !diving && times.length > 30) {
        if (useBloom) {
          if (stats.fps < 45) {
            slowSince ||= now;
            if (now - slowSince > 2000) {
              useBloom = false;
              stats.bloom = false;
              slowSince = 0;
              times.length = 0;
              calmFrom = now + 1500;
            }
          } else slowSince = 0;
        }
        if (stats.fps < 30) {
          lowSince ||= now;
          if (now - lowSince > 2500) live.current.onFail("fps");
        } else lowSince = 0;
      }
    });

    return () => {
      disposed = true;
      live.current.diveRef.current = null;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("webglcontextlost", onLost);
      people.forEach((c) => c?.dispose());
      dioramas.forEach((d) => d.dispose());
      kit.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      floorTex.dispose();
      halos.forEach((h) => h.material.dispose());
      haloTex.dispose();
      target?.dispose();
      bloom.dispose();
      composer?.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      canvas.remove();
      const w = window as unknown as { __picker?: typeof stats };
      if (w.__picker === stats) delete w.__picker;
    };
  }, []);

  const { items, selected } = props;
  return (
    <div ref={host} className="absolute inset-0 overflow-hidden" data-picker-canvas>
      <div className="pointer-events-none absolute inset-0" role="radiogroup" aria-label="Players">
        {items.map((it, i) => (
          <button
            key={it.id}
            ref={(b) => {
              buttons.current[i] = b;
            }}
            type="button"
            role="radio"
            aria-checked={!it.locked && it.id === selected}
            aria-disabled={it.locked || undefined}
            aria-label={it.label}
            tabIndex={!it.locked && it.id === selected ? 0 : -1}
            onClick={() => activateRef.current(i)}
            className="picker-hit absolute left-0 top-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent focus-visible:ring-offset-0"
          />
        ))}
        {items.map((it, i) =>
          it.locked ? (
            <div
              key={`cap-${it.id}`}
              ref={(c) => {
                captions.current[i] = c;
              }}
              className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgb(2_30_67/0.7)] px-3 py-1.5 text-[13px] font-semibold text-white/80 ring-1 ring-white/15"
            >
              <LockSimple size={13} weight="bold" aria-hidden />
              {it.title}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function haloTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
