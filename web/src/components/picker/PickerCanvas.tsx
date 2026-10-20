"use client";

import { LockSimple } from "@phosphor-icons/react";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { dragFocus, indexOfId, layout, nearestPlayable, type PlayableId } from "./carousel";
import { buildDiorama, pickerKit } from "./dioramaSource";
import { loadCharacters } from "./characterGltf";
import type { Character, CharacterId } from "./characterTypes";
import type { Diorama, DioramaId } from "./dioramaTypes";

// The 3D carousel. Vanilla three.js inside one effect (like pitch3d): no lights that cost per pixel,
// no shadow maps, shared materials, half-resolution bloom that switches off if the GPU struggles.
// Text stays in the DOM (sharp on a projector, accessible); the canvas only draws the dioramas.

export interface PickerItem { id: DioramaId; label: string; locked: boolean; title?: string }
export type DiveFn = (id: PlayableId, onCover: (remainingMs: number) => void) => Promise<void>;

export interface PickerCanvasProps {
  items: PickerItem[];
  selected: PlayableId;
  onSelect: (id: PlayableId) => void;
  onActivate: (id: PlayableId) => void;
  onReady: () => void;
  onFail: (reason: "fps" | "context" | "init") => void;
  diveRef: MutableRefObject<DiveFn | null>;
  reduce: boolean;
}

const NIGHT = "#021e43";
const PERSON: Record<DioramaId, CharacterId> = { house: "thomas", business: "lina", retire: "retiree", baby: "parent", car: "driver" };
const CAM_POS = new THREE.Vector3(0, 3.1, 12.6);
const CAM_LOOK = new THREE.Vector3(0, 0.15, -1.4);
const ease = {
  inCubic: (x: number) => x * x * x,
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
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
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
    scene.fog = new THREE.Fog(NIGHT, 13, 30);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    camera.position.copy(CAM_POS);
    camera.lookAt(CAM_LOOK);

    scene.add(new THREE.HemisphereLight("#6f8fc4", "#0a1426", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 2.2);
    key.position.set(4, 7, 6);
    const rim = new THREE.DirectionalLight("#7fb2ff", 0.8);
    rim.position.set(-6, 4, -5);
    scene.add(key, rim);

    // Stage floor: a soft pool of light under the carousel (one canvas gradient, no lights).
    const floorTex = radialTexture("#123c6e", NIGHT);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshBasicMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.34, -2);
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
      })
      .catch(() => {
        /* the scenes still work without people */
      });

    // Post: bloom at half resolution on a multisampled half-float target (keeps edges clean).
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    let useBloom = true;

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2);
      camera.aspect = w / h;
      // Keep the side items in frame on narrower screens.
      camera.fov = w / h < 1.5 ? 36 : 30;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ── State
    let focus = indexOfId(live.current.selected);
    let vel = 0;
    let drag: { id: number; x: number; start: number; moved: boolean } | null = null;
    let dragFocusValue = focus;
    let diving = false;
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
      if (diving) return;
      drag = { id: e.pointerId, x: e.clientX, start: focus, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) dragFocusValue = dragFocus(drag.start, dx, canvas.clientWidth);
        return;
      }
      const i = pick(e.clientX, e.clientY);
      canvas.style.cursor = i != null && !live.current.items[i]?.locked ? "pointer" : i != null ? "not-allowed" : "grab";
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasDrag = drag.moved;
      drag = null;
      if (wasDrag) {
        const id = nearestPlayable(dragFocusValue);
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

    // ── Dive into the window, then let the handoff overlay take over.
    live.current.diveRef.current = (id, onCover) =>
      new Promise<void>((resolve) => {
        const i = indexOfId(id);
        const d = dioramas[i];
        if (!d || live.current.reduce) {
          resolve();
          return;
        }
        diving = true;
        focus = i;
        vel = 0;
        holders.forEach((h) => (h.userData.settle = 0));
        people[i]?.setPose("cheer");
        // Settle the turntable to face the camera (the person hops), then fly into the lit window.
        const start = performance.now();
        const settleMs = 420;
        const flyMs = 900;
        const fromPos = camera.position.clone();
        const fromLook = CAM_LOOK.clone();
        const fromFov = camera.fov;
        let covered = false;
        const step = () => {
          if (disposed) return resolve();
          const t = performance.now() - start;
          holders[i].userData.settle = Math.min(1, t / settleMs);
          const k = Math.min(1, Math.max(0, (t - settleMs * 0.6) / flyMs));
          // Target: just in front of the window, looking straight through it.
          d.window.updateWorldMatrix(true, false);
          const wp = new THREE.Vector3().setFromMatrixPosition(d.window.matrixWorld);
          const n = new THREE.Vector3(0, 0, 1).transformDirection(d.window.matrixWorld);
          const toPos = wp.clone().addScaledVector(n, 0.22);
          const toLook = wp.clone().addScaledVector(n, -1.5);
          const e1 = ease.inCubic(k);
          camera.position.lerpVectors(fromPos, toPos, e1);
          const look = new THREE.Vector3().lerpVectors(fromLook, toLook, ease.inOutCubic(Math.min(1, k * 1.25)));
          camera.lookAt(look);
          camera.fov = fromFov + (26 - fromFov) * e1;
          camera.updateProjectionMatrix();
          d.setFocus(1 + 1.5 * e1);
          if (!covered && k >= 0.68) {
            covered = true;
            onCover(Math.max(120, flyMs * (1 - k)));
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
    let readySent = false;
    const stats = { fps: 60, calls: 0, triangles: 0, bloom: true, people: [] as unknown[] };
    (window as unknown as { __picker?: typeof stats }).__picker = stats;
    const proj = new THREE.Vector3();

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
        h.visible = Math.abs(i - focus) < 2.35; // the far end of the list stays out of frame
        const spin = reduceMotion() ? 0 : Math.sin(t * 0.32 + i * 1.7) * 0.32 * s.light;
        const settle = (h.userData.settle as number | undefined) ?? 0;
        wiggle[i] = Math.max(0, wiggle[i] - dt * 2.4);
        const shake = wiggle[i] > 0 ? Math.sin(wiggle[i] * 28) * 0.07 * wiggle[i] : 0;
        h.rotation.y = s.rotY + spin * (1 - settle) + shake;
        const d = dioramas[i];
        if (!diving || d !== dioramas[indexOfId(live.current.selected)]) d.setFocus(s.light);
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
          b.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
          b.style.width = b.style.height = `${size}px`;
        }
        const c = captions.current[i];
        if (c) {
          proj.set(s.x, -0.45, s.z + 1.2 * s.scale).project(camera);
          c.style.transform = `translate(${(proj.x * 0.5 + 0.5) * r.width}px, ${(-proj.y * 0.5 + 0.5) * r.height}px) translateX(-50%)`;
          c.style.opacity = diving || !h.visible ? "0" : String(Math.min(1, 0.4 + s.light));
        }
      });

      if (!diving) {
        camera.position.copy(CAM_POS);
        camera.lookAt(CAM_LOOK);
      }

      if (useBloom) composer.render();
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
      if (now - t0 > 3500 && !diving) {
        if (useBloom && stats.fps < 45) {
          useBloom = false;
          stats.bloom = false;
          times.length = 0;
        } else if (stats.fps < 30) {
          lowSince ||= now;
          if (now - lowSince > 2000) live.current.onFail("fps");
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
      target.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
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

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
