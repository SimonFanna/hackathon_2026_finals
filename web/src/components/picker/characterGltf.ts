import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { Character, CharacterId, Pose } from "./characterTypes";

// The 3D people, from two CC0 Quaternius models (credits: public/picker/CREDITS.md), loaded once from
// /public (offline, same origin, no decoder needed) and cloned per character with SkeletonUtils.
// Clothes are recoloured with the KBC tokens, as in Victor's 2D avatars.

const FILES = {
  casual: "/picker/quaternius-casual-character.glb",
  woman: "/picker/quaternius-animated-woman.glb",
} as const;

const MODEL: Record<CharacterId, keyof typeof FILES> = {
  thomas: "casual",
  lina: "woman",
  retiree: "casual",
  parent: "woman",
  driver: "casual",
};

// Material names come from the glTF files (see the inspection notes in docs/features/persona-picker-3d.md).
const TINTS: Partial<Record<CharacterId, Record<string, string>>> = {
  thomas: { LightBrown: "#0097db", Hair: "#4a3426", Eyebrows: "#3a2a1f", Skin: "#f1c7a5", Skin_Darker: "#dba98a", LightBlue: "#1d3557", White: "#ece8e1", Red_Dark: "#2b2f36" },
  lina: { LimeGreen: "#00903d", Brown: "#1f1a17", Skin: "#c68e6a", Red: "#8c3a34", Gold: "#e2c27a" },
};

const HEIGHT = 1.1;
const SILHOUETTE = "#24426b";

const CLIPS: Record<Pose, string> = { idle: "Idle", wave: "Wave", cheer: "Wave" };
const HOP = 0.12;

// A thin cool rim (fresnel) that separates the people from brick walls and the navy background.
const RIM = new THREE.Color("#9cc8ff");
function addRim(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: RIM };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;")
      .replace(
        "#include <dithering_fragment>",
        "float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);\ngl_FragColor.rgb += uRim * rimF * 0.32;\n#include <dithering_fragment>",
      );
  };
  mat.customProgramCacheKey = () => "picker-rim";
}

// A soft contact shadow under the feet (one small quad each, no shadow map). Shared, like the glTF cache.
let blob: { geo: THREE.PlaneGeometry; tex: THREE.CanvasTexture } | null = null;
function blobShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  if (!blob) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,8,24,0.62)");
    grad.addColorStop(0.45, "rgba(0,8,24,0.34)");
    grad.addColorStop(1, "rgba(0,8,24,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    blob = { geo: new THREE.PlaneGeometry(0.56, 0.4).rotateX(-Math.PI / 2), tex };
  }
  const mat = new THREE.MeshBasicMaterial({ map: blob.tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(blob.geo, mat);
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

// The models are exported flat-shaded (split normals): merge them once so faces read soft, not faceted.
function smoothNormals(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone();
    g.deleteAttribute("normal");
    const merged = mergeVertices(g, 1e-4);
    merged.computeVertexNormals();
    g.dispose();
    mesh.geometry.dispose();
    mesh.geometry = merged;
  });
}

let cache: Promise<Record<keyof typeof FILES, GLTF>> | null = null;

function loadAll(): Promise<Record<keyof typeof FILES, GLTF>> {
  if (!cache) {
    const loader = new GLTFLoader();
    cache = Promise.all(Object.entries(FILES).map(([k, url]) => loader.loadAsync(url).then((g) => (smoothNormals(g.scene), [k, g] as const)))).then(
      (entries) => Object.fromEntries(entries) as Record<keyof typeof FILES, GLTF>,
    );
    cache.catch(() => (cache = null));
  }
  return cache;
}

export async function loadCharacters(ids: CharacterId[]): Promise<Map<CharacterId, Character>> {
  const gltfs = await loadAll();
  return new Map(ids.map((id) => [id, makeCharacter(id, gltfs[MODEL[id]])]));
}

function makeCharacter(id: CharacterId, gltf: GLTF): Character {
  const model = cloneSkinned(gltf.scene) as THREE.Group;
  const tint = TINTS[id] ?? {};
  const materials: THREE.MeshStandardMaterial[] = [];
  const base = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // skinned bounds are bind-pose only
    const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      const mat = src.clone();
      const hex = tint[src.name];
      if (hex) mat.color.set(hex);
      mat.roughness = Math.min(1, Math.max(0.55, mat.roughness ?? 0.8));
      mat.metalness = 0;
      addRim(mat);
      materials.push(mat);
      base.set(mat, mat.color.clone());
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? list : list[0];
  });

  // Normalise: feet on y = 0, HEIGHT tall, facing +z.
  // Bind-pose bounds (FBX2glTF exports carry a unit scale on RootNode, so measure in world space).
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = HEIGHT / Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(s);
  model.position.y = -box.min.y * s;
  model.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.name = `character-${id}`;
  const shadow = blobShadow();
  root.add(shadow);
  root.userData.measured = { height: +size.y.toFixed(3), scale: +s.toFixed(4) };
  const hop = new THREE.Group();
  hop.add(model);
  root.add(hop);

  const mixer = new THREE.AnimationMixer(model);
  const action = (name: string) => {
    const clip = gltf.animations.find((a) => a.name.endsWith(`|${name}`) || a.name === name);
    return clip ? mixer.clipAction(clip) : null;
  };
  const actions: Record<Pose, THREE.AnimationAction | null> = { idle: action(CLIPS.idle), wave: action(CLIPS.wave), cheer: action(CLIPS.cheer) };
  // Offset each character's idle so they never breathe in sync.
  const idle = actions.idle;
  if (idle) {
    idle.play();
    idle.time = (id.length * 0.37) % Math.max(idle.getClip().duration, 0.1);
  }
  let pose: Pose = "idle";
  let cheerT = -1;
  let locked = false;
  let focus = 1;

  const applyColours = () => {
    for (const m of materials) {
      if (locked) {
        m.color.set(SILHOUETTE);
        m.emissive.setRGB(0, 0, 0);
      } else {
        m.color.copy(base.get(m)!).multiplyScalar(0.55 + 0.45 * focus);
        m.emissive.copy(m.color).multiplyScalar(0.07); // a touch of self-light so faces never go muddy
      }
    }
  };

  return {
    id,
    root,
    setPose(next) {
      if (next === pose && next !== "cheer") return;
      const from = actions[pose];
      const to = actions[next];
      pose = next;
      if (next === "cheer") cheerT = 0;
      if (!to || from === to) return;
      to.reset();
      to.setEffectiveTimeScale(1);
      to.setEffectiveWeight(1);
      to.play();
      if (from) to.crossFadeFrom(from, 0.3, false);
    },
    setLocked(l) {
      locked = l;
      applyColours();
      if (idle) idle.setEffectiveTimeScale(l ? 0.6 : 1);
    },
    setFocus(f) {
      const q = Math.round(f * 20) / 20; // only recolour on real changes
      if (q === focus) return;
      focus = q;
      applyColours();
    },
    update(_t, dt) {
      mixer.update(dt);
      if (cheerT >= 0) {
        cheerT += dt;
        const k = Math.min(cheerT / 0.55, 1);
        hop.position.y = Math.sin(k * Math.PI) * HOP; // one happy hop
        shadow.scale.setScalar(1 - hop.position.y * 1.8); // the contact shadow tightens in the air
        shadow.material.opacity = 1 - hop.position.y * 2.5;
        if (k >= 1) cheerT = -1;
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      materials.forEach((m) => m.dispose());
      shadow.material.dispose();
      // Geometries are shared with the cached glTF (SkeletonUtils.clone shares them): not disposed here.
    },
  };
}
