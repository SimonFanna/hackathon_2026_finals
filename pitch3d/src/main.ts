import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { BEAT_COUNT, actionForKey, parseParams, step } from "./beats";
import snapshot from "./data/lucas.json";
import { Director } from "./director";
import { FpsGovernor, preset, type Quality } from "./quality";
import { buildBelgium } from "./scene/belgium";
import { buildEffects, cameraFacing } from "./scene/effects";
import { C, glowSprite, materialKit } from "./scene/materials";
import { SPOTS, buildWorld } from "./scene/world";
import { buildStory, type Snapshot } from "./story";
import { buildOverlay } from "./ui/overlay";

const story = buildStory(snapshot as unknown as Snapshot);
const params = parseParams(location.search);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let quality: Quality = params.quality ?? "high";
let autoQuality = params.quality == null; // ?q=high or ?q=low pins the mode
// Built once at the density of the starting preset; Q later trims instances live.
const bootPreset = preset(quality, devicePixelRatio);

// ── Renderer, scene, camera
const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: bootPreset.antialias, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = C.nightDeep.clone();
const fog = new THREE.FogExp2(C.nightDeep.clone(), 0.018);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight("#5d84c2", "#06101f", 1.25));
const moon = new THREE.DirectionalLight("#b9d4ff", 1.9);
moon.position.set(-16, 20, -12);
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
moon.shadow.bias = -0.0008;
moon.shadow.normalBias = 0.02;
scene.add(moon);

// ── Content
const kit = materialKit();
const sprite = glowSprite();
const world = buildWorld(kit, bootPreset.density, quality === "high");
const effects = buildEffects(world, kit, story.signals.length + story.kateQuestions.length, bootPreset.density);
const diorama = new THREE.Group();
diorama.add(world.root, effects.root);
scene.add(diorama);
const belgium = buildBelgium(story.cityLights, sprite, bootPreset.density);
scene.add(belgium.root);

// ── Labels
const labels = new CSS2DRenderer();
labels.domElement.className = "labels";
document.body.appendChild(labels.domElement);
function label(text: string, at: THREE.Vector3, beats: string, cls = "", parent: THREE.Object3D = diorama) {
  const div = document.createElement("div");
  div.className = `label ${cls}`;
  div.textContent = text;
  div.dataset.show = beats;
  const obj = new CSS2DObject(div);
  obj.position.copy(at);
  parent.add(obj);
  return obj;
}
label(story.hero.firstName, world.tops.lucas.clone().add(new THREE.Vector3(0, 0.5, 0)), "0 1 3 4 5");
label("KBC", world.tops.kbc.clone().add(new THREE.Vector3(0, 0.7, 0)), "1 4 5", "kbc");
label("Billit · partner", world.partner.billit.top.clone().add(new THREE.Vector3(0, 0.5, 0)), "3 4 5");
label("Go Solid · partner", world.partner.goSolid.top.clone().add(new THREE.Vector3(0, 0.5, 0)), "3 4 5", "partner-dark");
label("Studio", SPOTS.workshop.clone().setY(2.9), "3");
for (const d of story.districts) label(d.label, world.districts[d.id].center.clone().setY(2.2), "5");
for (const c of belgium.cityAnchors.filter((a) => ["Antwerpen", "Gent", "Brussel", "Liège", "Namur", "Brugge", "Hasselt"].includes(a.city))) {
  label(c.city, c.pos.clone().setY(6), "6", "city", belgium.root);
}
label("Leuven", new THREE.Vector3(0, 6, 0), "6", "city", belgium.root);

// ── Overlay + director
const overlay = buildOverlay(story, BEAT_COUNT);
document.body.appendChild(overlay.root);
const director = new Director(camera, reducedMotion);
const now = () => performance.now() / 1000;
director.go(params.beat, now(), true);
overlay.setBeat(params.beat);

// ── Post-processing (high quality only)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.55, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function applyQuality(q: Quality, reason: "auto" | "manual" | "boot") {
  quality = q;
  const p = preset(q, devicePixelRatio);
  renderer.setPixelRatio(p.pixelRatio);
  renderer.shadowMap.enabled = q === "high";
  moon.castShadow = q === "high";
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((mm) => (mm.needsUpdate = true));
  });
  world.setDensity(p.density);
  composer.setPixelRatio(p.pixelRatio);
  resize();
  overlay.setQuality(q === "low" ? `Low quality${reason === "auto" ? " (auto)" : ""}` : null);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  labels.setSize(w, h);
}
addEventListener("resize", resize);
applyQuality(quality, "boot");

// ── Input
function act(a: ReturnType<typeof actionForKey>) {
  if (!a) return;
  if (a === "quality") {
    autoQuality = false;
    applyQuality(quality === "high" ? "low" : "high", "manual");
    return;
  }
  const next = step(director.beat, a);
  if (next === director.beat && a !== "restart") return;
  director.go(next, now(), a === "restart");
  overlay.setBeat(next);
}
addEventListener("keydown", (e) => {
  const a = actionForKey(e.key);
  if (a) {
    e.preventDefault();
    act(a);
  }
});
renderer.domElement.addEventListener("click", () => act("next"));

// ── Loop
const governor = new FpsGovernor({ windowMs: 2000, minFps: 30, warmupMs: 1500 });
let last = now();
const t0 = last;
const stats = { beat: params.beat, fps: 60, quality, calls: 0, triangles: 0 };
(window as unknown as { __pitch: typeof stats }).__pitch = stats;

renderer.setAnimationLoop(() => {
  const tNow = now();
  const dt = Math.min(tNow - last, 0.1);
  last = tNow;
  const t = tNow - t0;
  director.update(tNow);
  const L = director.levels;

  const s = THREE.MathUtils.lerp(0.06, 1, L.diorama);
  diorama.scale.setScalar(s);
  diorama.visible = L.diorama > 0.02 || L.map < 0.99;
  fog.density = THREE.MathUtils.lerp(0.0007, 0.018, L.diorama);
  cameraFacing.copy(camera.quaternion);

  world.update(t);
  effects.apply(L, t, dt);
  belgium.apply(L.map, L.realLights, L.field, t);
  overlay.tick(L);

  if (quality === "high") composer.render();
  else renderer.render(scene, camera);
  labels.render(scene, camera);

  const drop = governor.sample(tNow * 1000);
  stats.fps = Math.round(governor.fps);
  stats.beat = director.beat;
  stats.quality = quality;
  stats.calls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  if (drop && autoQuality && quality === "high") {
    applyQuality("low", "auto");
    governor.reset();
  }
});
