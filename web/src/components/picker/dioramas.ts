import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Diorama, DioramaId, PickerKit } from "./dioramaTypes";

// Procedural miniature dioramas for the 3D "choose your player" carousel.
// Scale: a person is ~1.1 units tall, doors are ~0.95. Plinth top at y = 0, front = +z.
// Budget per diorama: <= 25 draw calls and <= 25k triangles. Static geometry is merged per material,
// standard materials are shared through the kit, every texture is a canvas, no lights are created here.

const DEFAULT_FONT = '"Nunito Sans", system-ui, sans-serif';
const GROUND_R = 1.6; // radius of the ground disc
const GROUND_HALF = 1.62; // half-size of the square the ground canvas covers
const PLINTH_BOTTOM = -0.32;
const RING_Y = -0.086; // selection ring, flat, just under the steel ledge
const WARM = "#ffc98a";
const AMBER = "#ffb46a";
const NAVY = "#0d2a50";
const ACCENT = "#0097db";

// ───────────────────────────── pure helpers (unit-tested) ─────────────────────────────

/** Emissive multiplier for a focus value. 0 = side of the carousel, 1 = centred, > 1 during the dive. */
export function glowScale(focus: number): number {
  const f = Number.isFinite(focus) ? Math.max(0, focus) : 1;
  return 0.14 + 0.86 * f;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Locked look: sRGB in, grey-blue sRGB out. Keeps the value (luma) so the scene still reads. */
export function lockedRGB(r: number, g: number, b: number): [number, number, number] {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const v = 0.06 + 0.55 * l;
  return [clamp01(v * 0.86), clamp01(v * 0.94), clamp01(v * 1.06 + 0.03)];
}

/** Selection ring under the centred plinth: fades in over the last 40% of the focus. */
export function ringOpacity(focus: number): number {
  const f = Number.isFinite(focus) ? Math.min(focus, 1) : 1;
  const t = clamp01((f - 0.6) / 0.4);
  return t * t * (3 - 2 * t);
}

/** World coordinate (x or z) to ground-canvas pixels. */
export function groundPx(v: number, size: number, half = GROUND_HALF): number {
  return ((v + half) / (2 * half)) * size;
}

/** Gentle two-frequency sway, used for the hanging signs. */
export function sway(t: number, amp: number, speed = 1): number {
  return amp * (Math.sin(t * 1.7 * speed) * 0.7 + Math.sin(t * 0.83 * speed + 1.3) * 0.3);
}

// ───────────────────────────── small utilities ─────────────────────────────

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tint(hex: string, k: number, a = 1): string {
  const [r, g, b] = rgb(hex);
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v * k)));
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas unavailable");
  return { c, g };
}

function canvasTexture(c: HTMLCanvasElement, opts: { color?: boolean; repeat?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Draw a blurred shape (soft shadow / glow) without ctx.filter: only the offset shadow lands on the canvas. */
function soft(g: CanvasRenderingContext2D, blur: number, color: string, draw: (g: CanvasRenderingContext2D) => void): void {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.shadowOffsetX = 10000;
  g.translate(-10000, 0);
  g.fillStyle = "#000";
  g.strokeStyle = "#000";
  draw(g);
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Transform: translation, XYZ euler, scale. */
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

const G = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  rbox: (w: number, h: number, d: number, r: number, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)),
  cyl: (rt: number, rb: number, h: number, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  sphere: (r: number, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs),
  ico: (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail),
  torus: (r: number, tube: number, rs = 6, ts = 18, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc),
  plane: (w: number, h: number) => new THREE.PlaneGeometry(w, h),
  circle: (r: number, seg = 24) => new THREE.CircleGeometry(r, seg),
};

/** World-consistent UVs (box projection), so brick / leaves / stripes keep one scale on every face. */
function projectUV(geo: THREE.BufferGeometry, scale: number): void {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  if (!pos || !nor) return;
  const uv = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z * scale, y * scale);
    else if (ay >= az) uv.setXY(i, x * scale, z * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  geo.setAttribute("uv", uv);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = list.some((g) => !g.index);
  const ready = list.map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    g.clearGroups();
    if (nonIndexed && g.index) {
      const n = g.toNonIndexed();
      g.dispose();
      return n;
    }
    return g;
  });
  const merged = ready.length === 1 ? ready[0] : mergeGeometries(ready, false);
  if (ready.length > 1) ready.forEach((g) => g.dispose());
  if (!merged) throw new Error("mergeGeometries failed");
  sanitize(merged);
  return merged;
}

/**
 * Degenerate faces (duplicate outline points in extrusions) get zero normals; under MSAA a single
 * sample can still hit them and write NaN, which bloom then smears over the whole frame. Fix them.
 */
function sanitize(geo: THREE.BufferGeometry): void {
  const n = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (n) {
    const a = n.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const l = Math.hypot(a[i], a[i + 1], a[i + 2]);
      if (!Number.isFinite(l) || l < 1e-6) {
        a[i] = 0;
        a[i + 1] = 1;
        a[i + 2] = 0;
      } else if (Math.abs(l - 1) > 1e-3) {
        a[i] /= l;
        a[i + 1] /= l;
        a[i + 2] /= l;
      }
    }
  }
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (uv) {
    const a = uv.array as Float32Array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) a[i] = 0;
  }
}

/** Collects geometry per material, then emits one merged mesh per material (one draw call each). */
class Builder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private tmp = new THREE.Matrix4();

  private top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  at(m: THREE.Matrix4, fn: () => void): void {
    this.stack.push(this.top().clone().multiply(m));
    fn();
    this.stack.pop();
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4): void {
    geo.applyMatrix4(m ? this.tmp.multiplyMatrices(this.top(), m) : this.top());
    const s = mat.userData.uvScale as number | undefined;
    if (s) projectUV(geo, s);
    const list = this.buckets.get(mat);
    if (list) list.push(geo);
    else this.buckets.set(mat, [geo]);
  }

  /** Axis-aligned box from two corners (in the current frame), optionally rounded. */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0): void {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    this.add(r > 0 ? G.rbox(w, h, d, r) : G.box(w, h, d), mat, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }

  build(parent: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.buckets) {
      const mesh = new THREE.Mesh(mergeAll(list), mat);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

/** Vertical prism from a top-view footprint [x, z][], spanning y0..y1. */
function prism(pts: [number, number][], y0: number, y1: number, bevel?: { size: number; thickness: number; offset?: number }): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, y1 - y0),
    bevelEnabled: !!bevel,
    bevelSize: bevel?.size ?? 0,
    bevelThickness: bevel?.thickness ?? 0,
    bevelOffset: bevel?.offset ?? 0,
    bevelSegments: 1,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Front-view slab (XY shape with holes) extruded towards -z from z = 0 (outer face at z = 0). */
function slab(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -depth);
  return g;
}

function rectPath(x0: number, y0: number, x1: number, y1: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(x0, y0);
  p.lineTo(x1, y0);
  p.lineTo(x1, y1);
  p.lineTo(x0, y1);
  p.closePath();
  return p;
}

// ───────────────────────────── painters ─────────────────────────────

function paintBrick(): HTMLCanvasElement {
  const S = 512;
  const rows = 16;
  const cols = 8;
  const bh = S / rows;
  const bw = S / cols;
  const { c, g } = makeCanvas(S, S);
  const r = rand(11);
  g.fillStyle = "#aa9d8c";
  g.fillRect(0, 0, S, S);
  const tones = ["#9b5d47", "#8f533f", "#a4654c", "#94604c", "#83503e", "#a05e46", "#8a5a49"];
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + off;
      const y = row * bh;
      const base = tones[Math.floor(r() * tones.length)];
      const k = 0.9 + r() * 0.2;
      g.fillStyle = tint(base, k);
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      g.fillStyle = tint(base, k * 1.13);
      g.fillRect(x + 2, y + 2, bw - 4, 3);
      g.fillStyle = tint(base, k * 0.74);
      g.fillRect(x + 2, y + bh - 5, bw - 4, 3);
    }
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(20,10,5,0.09)" : "rgba(255,236,214,0.07)";
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
}

function paintFoliage(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const r = rand(5);
  g.fillStyle = "#29412f";
  g.fillRect(0, 0, S, S);
  const tones = ["#223829", "#2c4733", "#365640", "#41654a", "#4f7553", "#5c8460"];
  for (let i = 0; i < 2600; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 2.2 + r() * 4.2;
    const t = tones[Math.min(tones.length - 1, Math.floor(Math.pow(r(), 1.5) * tones.length))];
    g.fillStyle = t;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, rad, rad * 0.75, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function paintAwning(): HTMLCanvasElement {
  const W = 128;
  const H = 8;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = "#f1ede4";
  g.fillRect(0, 0, W / 2, H);
  g.fillStyle = NAVY;
  g.fillRect(W / 2, 0, W / 2, H);
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(W / 2 - 2, 0, 2, H);
  g.fillRect(W - 2, 0, 2, H);
  return c;
}

/** Warm room seen through a window: lamp-lit wall and curtains (luminance; tinted by the material colour). */
function paintWindow(): HTMLCanvasElement {
  const W = 128;
  const H = 180;
  const { c, g } = makeCanvas(W, H);
  const bg = g.createRadialGradient(W * 0.5, H * 0.28, 4, W * 0.5, H * 0.42, H * 0.75);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.5, "#f1e3d1");
  bg.addColorStop(1, "#a28a74");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // pendant lamp
  g.fillStyle = "rgba(70,45,30,0.65)";
  g.fillRect(W / 2 - 1, 0, 2, 22);
  g.beginPath();
  g.moveTo(W / 2 - 15, 34);
  g.lineTo(W / 2 + 15, 34);
  g.lineTo(W / 2 + 8, 22);
  g.lineTo(W / 2 - 8, 22);
  g.closePath();
  g.fill();
  // a shelf with a plant silhouette in the back
  g.fillStyle = "rgba(90,60,40,0.35)";
  g.fillRect(W * 0.3, H * 0.62, W * 0.4, 3);
  g.fillStyle = "rgba(60,50,35,0.35)";
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.ellipse(W * 0.42 + i * 3, H * 0.6 - (i % 3) * 4, 5, 2.5, -0.6 + i * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  // curtains (per pixel)
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const tie = Math.exp(-Math.pow((y - H * 0.6) / (H * 0.08), 2));
    const below = y > H * 0.6 ? (y - H * 0.6) / (H * 0.4) : 0;
    const width = W * (0.22 - 0.08 * tie + 0.05 * below);
    for (let side = 0; side < 2; side++) {
      for (let x = 0; x < width; x++) {
        const px = side === 0 ? x : W - 1 - x;
        const fold = 0.66 + 0.2 * Math.sin((x / W) * 46 + side * 1.7 + y * 0.01) - 0.18 * (x / width) * (1 - tie);
        const i = (y * W + px) * 4;
        d[i] = 248 * fold;
        d[i + 1] = 196 * fold;
        d[i + 2] = 158 * fold;
      }
    }
  }
  // curtain rail
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] *= 0.45;
      d[i + 1] *= 0.42;
      d[i + 2] *= 0.4;
    }
  }
  g.putImageData(img, 0, 0);
  // floor shadow at the bottom
  const fl = g.createLinearGradient(0, H * 0.82, 0, H);
  fl.addColorStop(0, "rgba(0,0,0,0)");
  fl.addColorStop(1, "rgba(60,30,10,0.35)");
  g.fillStyle = fl;
  g.fillRect(0, H * 0.82, W, H * 0.18);
  return c;
}

/** Studio-ish equirect environment: night-blue room, a warm key softbox, a cool rim strip. */
function paintEnv(): HTMLCanvasElement {
  const W = 512;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#a9bcdc");
  sky.addColorStop(0.36, "#536c99");
  sky.addColorStop(0.5, "#22324f");
  sky.addColorStop(0.62, "#121c2f");
  sky.addColorStop(1, "#060b15");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const box = (u: number, v: number, w: number, h: number, color: string, blur: number) =>
    soft(g, blur, color, (h2) => {
      roundRect(h2, u * W - w / 2, v * H - h / 2, w, h, 8);
      h2.fill();
    });
  box(0.656, 0.25, 90, 44, "rgba(255,242,222,1)", 18);
  box(0.656, 0.25, 50, 22, "rgba(255,255,255,1)", 6);
  box(0.11, 0.35, 80, 30, "rgba(170,205,255,0.95)", 16);
  box(0.75, 0.44, 200, 12, "rgba(255,255,255,0.45)", 10);
  box(0.36, 0.3, 60, 26, "rgba(220,230,255,0.5)", 14);
  return c;
}

/** Soft light spill for the ground in front of lit windows (additive; black = no light). */
function paintPool(): HTMLCanvasElement {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(S / 2, S * 0.3, 2, S / 2, S * 0.45, S * 0.52);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.35, "#8a8a8a");
  grd.addColorStop(1, "#000000");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

function paintShadow(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(0,4,12,0.8)");
  grd.addColorStop(0.64, "rgba(0,4,12,0.72)");
  grd.addColorStop(0.73, "rgba(0,4,12,0.46)");
  grd.addColorStop(0.86, "rgba(0,4,12,0.14)");
  grd.addColorStop(1, "rgba(0,4,12,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

/** Grey copy of a canvas texture for the locked state (luma only; the twin's colour adds the blue). */
function greyCanvasTexture(src: THREE.Texture): THREE.Texture {
  const img = src.image as HTMLCanvasElement | undefined;
  if (!img || !(img instanceof HTMLCanvasElement)) return src;
  const { c, g } = makeCanvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = src.colorSpace;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.repeat.copy(src.repeat);
  t.offset.copy(src.offset);
  t.anisotropy = src.anisotropy;
  return t;
}

// ───────────────────────────── kit ─────────────────────────────

type Role =
  | "brick" | "render" | "slate" | "trim" | "bluestone" | "paving" | "cardboard" | "tape" | "wood" | "woodDark"
  | "foliage" | "bark" | "plinth" | "soil" | "zinc" | "door" | "shop" | "accent" | "glass" | "chrome" | "iron"
  | "awning" | "paint" | "rubber" | "fabric" | "balloonA" | "balloonB" | "brass";

interface Kit extends PickerKit {
  font: (px: number, weight?: number) => string;
  mat: Record<Role, THREE.MeshStandardMaterial>;
  windowTex: THREE.Texture;
  poolTex: THREE.Texture;
  lockedGlass: THREE.MeshStandardMaterial;
  shadow: { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial };
  ringGeo: THREE.BufferGeometry;
  padlock: { geo: THREE.BufferGeometry; mat: THREE.Material };
  twin(m: THREE.Material): THREE.Material;
  __kit: true;
}

function isKit(k: PickerKit): k is Kit {
  return (k as Partial<Kit>).__kit === true;
}

/** Builds the locked twin of a material: grey-blue, no emissive. Returns resources it created. */
function makeTwin(m: THREE.Material, lockedGlass: THREE.Material, created: { mats: THREE.Material[]; texs: THREE.Texture[] }): THREE.Material {
  if (m.userData.noLock) return m;
  const lockAs = m.userData.lockAs as "glass" | "dim" | undefined;
  if (lockAs === "glass") return lockedGlass;
  const greyMap = (t: THREE.Texture | null) => {
    if (!t) return null;
    const gt = greyCanvasTexture(t);
    if (gt !== t) created.texs.push(gt);
    return gt;
  };
  const lockColor = (c: THREE.Color) => {
    const s = { r: 0, g: 0, b: 0 };
    c.getRGB(s, THREE.SRGBColorSpace);
    const [r, g, b] = lockedRGB(s.r, s.g, s.b);
    c.setRGB(r, g, b, THREE.SRGBColorSpace);
  };
  let t: THREE.Material;
  if (m instanceof THREE.MeshStandardMaterial) {
    const s = m.clone();
    lockColor(s.color);
    s.map = greyMap(m.map);
    s.emissive.setRGB(0, 0, 0);
    s.emissiveIntensity = 0;
    s.emissiveMap = null;
    t = s;
  } else if (m instanceof THREE.MeshBasicMaterial && lockAs === "dim") {
    t = new THREE.MeshStandardMaterial({ color: "#2c3749", roughness: 0.85, map: greyMap(m.map) });
  } else if (m instanceof THREE.MeshBasicMaterial) {
    const s = m.clone();
    lockColor(s.color);
    s.map = greyMap(m.map);
    t = s;
  } else return m;
  created.mats.push(t);
  return t;
}

export function pickerKit(opts?: { fontFamily?: string }): PickerKit {
  const fontFamily = opts?.fontFamily?.trim() || DEFAULT_FONT;
  const texs: THREE.Texture[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const keep = <T extends THREE.Texture>(t: T) => {
    texs.push(t);
    return t;
  };
  const env = keep(canvasTexture(paintEnv()));
  env.mapping = THREE.EquirectangularReflectionMapping;
  const brickTex = keep(canvasTexture(paintBrick(), { repeat: true }));
  const leafTex = keep(canvasTexture(paintFoliage(), { repeat: true }));
  const awningTex = keep(canvasTexture(paintAwning(), { repeat: true }));
  const windowTex = keep(canvasTexture(paintWindow()));
  const poolTex = keep(canvasTexture(paintPool()));
  const shadowTex = keep(canvasTexture(paintShadow(), { color: false }));

  const S = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const E = (i: number) => ({ envMap: env, envMapIntensity: i });
  const mat: Record<Role, THREE.MeshStandardMaterial> = {
    brick: S("#ffffff", 0.9, 0, { map: brickTex }),
    render: S("#e3dbce", 0.92),
    slate: S("#2e3749", 0.55, 0.1, E(0.45)),
    trim: S("#ebe6dc", 0.55),
    bluestone: S("#515a68", 0.62, 0, E(0.25)),
    paving: S("#a69f94", 0.88),
    cardboard: S("#b98b5c", 0.9),
    tape: S("#d9bf8d", 0.3, 0, E(0.5)),
    wood: S("#7a5a3f", 0.72),
    woodDark: S("#4b3729", 0.66),
    foliage: S("#ffffff", 0.95, 0, { map: leafTex }),
    bark: S("#5b4636", 0.9),
    plinth: S("#1e3d66", 0.45, 0.1, E(0.35)),
    soil: S("#3b3029", 1),
    zinc: S("#7f8ba0", 0.35, 0.25, E(0.6)),
    door: S("#173f73", 0.32, 0, E(0.35)),
    shop: S("#183c69", 0.45, 0, E(0.3)),
    accent: S(ACCENT, 0.35, 0, E(0.3)),
    glass: S("#18243a", 0.06, 0, E(1.1)),
    chrome: S("#e4e8ee", 0.13, 1, E(1.15)),
    iron: S("#25282e", 0.48, 0.55, E(0.45)),
    awning: S("#ffffff", 0.82, 0, { map: awningTex }),
    paint: S("#e8ebef", 0.26, 0.3, E(0.9)),
    rubber: S("#1a1c20", 0.85),
    fabric: S("#2f4d7a", 0.9),
    balloonA: S("#f1ebdf", 0.32, 0, E(0.55)),
    balloonB: S("#8fb6e4", 0.32, 0, E(0.55)),
    brass: S("#c9a25e", 0.3, 0.9, E(1)),
  };
  mat.brick.userData.uvScale = 1; // one 512 px tile = 1 unit = 16 courses
  mat.foliage.userData.uvScale = 2.2;
  mat.awning.userData.uvScale = 1 / 0.19; // one white + one navy stripe = 0.19 units
  for (const m of Object.values(mat)) m.userData.kit = true;

  const lockedGlass = S("#1d2839", 0.12, 0, E(0.7));
  lockedGlass.userData.kit = true;

  const shadowGeo = G.plane(4.7, 4.7);
  shadowGeo.rotateX(-Math.PI / 2);
  geos.push(shadowGeo);
  const ringGeo = new THREE.RingGeometry(1.69, 1.715, 96, 1);
  ringGeo.rotateX(-Math.PI / 2);
  geos.push(ringGeo);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false });
  shadowMat.userData.noLock = true;

  // Padlock: rounded body, half-torus shackle with legs, keyhole.
  const body = G.rbox(0.42, 0.34, 0.14, 0.065, 3);
  const legL = G.cyl(0.032, 0.032, 0.2, 14);
  legL.translate(-0.115, 0.22, 0);
  const legR = G.cyl(0.032, 0.032, 0.2, 14);
  legR.translate(0.115, 0.22, 0);
  const arc = G.torus(0.115, 0.032, 10, 24, Math.PI);
  arc.translate(0, 0.32, 0);
  const keyShape = new THREE.Shape();
  keyShape.absarc(0, 0.025, 0.032, 0, Math.PI * 2, false);
  const keySlot = new THREE.Shape();
  keySlot.moveTo(-0.014, 0.01);
  keySlot.lineTo(0.014, 0.01);
  keySlot.lineTo(0.022, -0.075);
  keySlot.lineTo(-0.022, -0.075);
  keySlot.closePath();
  const key1 = new THREE.ShapeGeometry(keyShape, 16);
  const key2 = new THREE.ShapeGeometry(keySlot);
  key1.translate(0, 0, 0.0705);
  key2.translate(0, 0, 0.0705);
  // one mesh, one draw call: parts are told apart by vertex colour
  const tinted = (g: THREE.BufferGeometry, hex: string) => {
    const ni = g.index ? g.toNonIndexed() : g;
    const col = new THREE.Color(hex);
    const n = ni.getAttribute("position").count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    ni.setAttribute("color", new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(ni.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) ni.deleteAttribute(k);
    return ni;
  };
  const parts = [tinted(body, "#d9dfe7"), tinted(legL, "#f4f6f9"), tinted(legR, "#f4f6f9"), tinted(arc, "#f4f6f9"), tinted(key1, "#0b1a30"), tinted(key2, "#0b1a30")];
  const padGeo = mergeGeometries(parts, false);
  if (!padGeo) throw new Error("padlock merge failed");
  sanitize(padGeo);
  geos.push(padGeo);
  const padMat = S("#ffffff", 0.22, 0.85, { vertexColors: true, ...E(1.25) });
  padMat.userData.noLock = true;

  const twins = new Map<THREE.Material, THREE.Material>();
  const created = { mats: [] as THREE.Material[], texs: [] as THREE.Texture[] };

  const kit: Kit = {
    __kit: true,
    fontFamily,
    font: (px, weight = 800) => `${weight} ${Math.round(px)}px ${fontFamily}`,
    mat,
    windowTex,
    poolTex,
    lockedGlass,
    shadow: { geo: shadowGeo, mat: shadowMat },
    ringGeo,
    padlock: { geo: padGeo, mat: padMat },
    twin(m) {
      let t = twins.get(m);
      if (!t) {
        t = makeTwin(m, lockedGlass, created);
        twins.set(m, t);
      }
      return t;
    },
    dispose() {
      for (const m of Object.values(mat)) m.dispose();
      for (const m of [lockedGlass, shadowMat, padMat, ...created.mats]) m.dispose();
      for (const t of [...texs, ...created.texs]) t.dispose();
      for (const g of geos) g.dispose();
      twins.clear();
    },
  };
  return kit;
}

// ───────────────────────────── per-diorama context ─────────────────────────────

interface Glow {
  mat: THREE.MeshBasicMaterial;
  base: THREE.Color;
  gain: number;
}

class Ctx {
  readonly root = new THREE.Group();
  readonly mats: THREE.Material[] = [];
  readonly texs: THREE.Texture[] = [];
  readonly glows: Glow[] = [];
  readonly anim: ((t: number, dt: number) => void)[] = [];
  readonly twins = new Map<THREE.Material, THREE.Material>();
  readonly created = { mats: [] as THREE.Material[], texs: [] as THREE.Texture[] };
  disposed = false;

  constructor(readonly kit: Kit) {}

  own<T extends THREE.Material>(m: T): T {
    m.userData.owned = true;
    this.mats.push(m);
    return m;
  }

  tex<T extends THREE.Texture>(t: T): T {
    this.texs.push(t);
    return t;
  }

  /** Unlit glow (bloom catches values above ~0.85). Scaled by focus, swapped out when locked. */
  glow(hex: string, gain: number, opts: { map?: THREE.Texture; additive?: boolean; lockAs?: "glass" | "dim" | "hide" } = {}): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: hex, map: opts.map ?? null, toneMapped: false });
    if (opts.additive) {
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
    }
    mat.userData.lockAs = opts.lockAs ?? "glass";
    this.own(mat);
    this.glows.push({ mat, base: new THREE.Color(hex), gain });
    return mat;
  }

  twin(m: THREE.Material): THREE.Material {
    if (!m.userData.owned) return this.kit.twin(m);
    let t = this.twins.get(m);
    if (!t) {
      t = makeTwin(m, this.kit.lockedGlass, this.created);
      this.twins.set(m, t);
    }
    return t;
  }

  /** Warm light spill on the ground (top-view plane), scaled by focus, hidden when locked. */
  pool(b: Builder, gain: number, spots: [number, number, number, number, number?][]): void {
    const mat = this.glow(WARM, gain, { map: this.kit.poolTex, additive: true, lockAs: "hide" });
    for (const [x, z, w, d, ry = 0] of spots) {
      const g = G.plane(w, d);
      g.rotateX(-Math.PI / 2);
      b.add(g, mat, M(x, 0.004, z, 0, ry, 0));
    }
  }

  /** Canvas texture with text; repainted once the web font is ready. */
  text(w: number, h: number, draw: (g: CanvasRenderingContext2D, font: Kit["font"]) => void): THREE.CanvasTexture {
    const { c, g } = makeCanvas(w, h);
    const paint = () => {
      g.clearRect(0, 0, w, h);
      draw(g, this.kit.font);
    };
    paint();
    const t = this.tex(canvasTexture(c));
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const spec = this.kit.font(64);
    if (fonts && !fonts.check(spec)) {
      fonts.load(spec).then(
        () => {
          if (this.disposed) return;
          paint();
          t.needsUpdate = true;
        },
        () => undefined,
      );
    }
    return t;
  }

  /** Ground disc texture (top view; canvas top = back of the plinth). */
  ground(paint: (g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, S: number, r: () => number) => void, seed: number): THREE.MeshStandardMaterial {
    const S = 512;
    const { c, g } = makeCanvas(S, S);
    const X = (x: number) => groundPx(x, S);
    const Z = (z: number) => groundPx(z, S);
    paint(g, X, Z, S, rand(seed));
    // darker towards the rim, so the eye stays on the scene
    const v = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
    v.addColorStop(0, "rgba(5,10,20,0)");
    v.addColorStop(1, "rgba(5,10,20,0.32)");
    g.fillStyle = v;
    g.fillRect(0, 0, S, S);
    return this.own(new THREE.MeshStandardMaterial({ map: this.tex(canvasTexture(c)), roughness: 0.92 }));
  }

  dispose(): void {
    this.disposed = true;
    for (const m of [...this.mats, ...this.created.mats]) m.dispose();
    for (const t of [...this.texs, ...this.created.texs]) t.dispose();
  }
}

// Ground painting helpers ----------------------------------------------------------

function paintLawn(g: CanvasRenderingContext2D, S: number, r: () => number, base = "#30493a"): void {
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 20 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const k = r() < 0.5 ? 0.82 : 1.16;
    gr.addColorStop(0, tint(base, k, 0.35));
    gr.addColorStop(1, tint(base, k, 0));
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = tint(base, 0.72 + r() * 0.6, 0.5);
    g.fillRect(r() * S, r() * S, 1.2, 1.5 + r() * 2.5);
  }
}

function aoRect(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, x0: number, z0: number, x1: number, z1: number, blur: number, a: number): void {
  soft(g, blur, `rgba(6,10,18,${a})`, (h) => h.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)));
}

function aoDisc(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, x: number, z: number, rad: number, blur: number, a: number): void {
  soft(g, blur, `rgba(6,10,18,${a})`, (h) => {
    h.beginPath();
    h.arc(X(x), Z(z), (rad / (2 * GROUND_HALF)) * 512, 0, Math.PI * 2);
    h.fill();
  });
}

// Shared scene pieces --------------------------------------------------------------

interface SceneOut {
  window: THREE.Mesh;
  stand: [number, number, number];
  /** Yaw of the stand (turned a little towards the camera axis). */
  standRotY: number;
  /** Padlock centre (scaled 0.8: spans y - 0.14 .. y + 0.34). */
  padlock: [number, number, number];
}

function addPlinth(b: Builder, k: Kit, ground: THREE.Material): void {
  const m = k.mat;
  const top = G.circle(GROUND_R, 72);
  top.rotateX(-Math.PI / 2);
  b.add(top, ground);
  b.add(G.cyl(GROUND_R + 0.012, GROUND_R + 0.012, 0.075, 72, true), m.soil, M(0, -0.0375, 0));
  const ledge = new THREE.RingGeometry(GROUND_R, 1.665, 72, 1);
  ledge.rotateX(-Math.PI / 2);
  b.add(ledge, m.zinc, M(0, -0.075, 0));
  b.add(G.cyl(1.665, 1.685, 0.02, 72, true), m.zinc, M(0, -0.085, 0));
  b.add(G.cyl(1.685, 1.685, 0.2, 72, true), m.plinth, M(0, -0.195, 0));
  b.add(G.cyl(1.685, 1.645, 0.025, 72, true), m.plinth, M(0, -0.3075, 0));
  const bottom = G.circle(1.645, 48);
  bottom.rotateX(Math.PI / 2);
  b.add(bottom, m.plinth, M(0, PLINTH_BOTTOM, 0));
}

/** Window frame in an opening (x0..x1, y0..y1) of a facade whose outer face is at z = zf. */
function frameOpening(b: Builder, mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, zf: number, f = 0.03, depth = 0.04, inset = 0.03): void {
  const z0 = zf - inset - depth;
  const z1 = zf - inset;
  b.box(mat, x0, y0, z0, x0 + f, y1, z1);
  b.box(mat, x1 - f, y0, z0, x1, y1, z1);
  b.box(mat, x0 + f, y0, z0, x1 - f, y0 + f, z1);
  b.box(mat, x0 + f, y1 - f, z0, x1 - f, y1, z1);
}

/** A window applied on a plain wall (local frame: wall surface at z = 0, centred at 0,0). */
function appliedWindow(b: Builder, k: Kit, w: number, h: number, opts: { glass?: THREE.Material; sill?: boolean; cross?: boolean; sillMat?: THREE.Material } = {}): void {
  const m = k.mat;
  const f = 0.032;
  const glass = G.plane(w, h);
  b.add(glass, opts.glass ?? m.glass, M(0, 0, 0.004));
  b.box(m.trim, -w / 2 - f, -h / 2 - f, 0, -w / 2, h / 2 + f, 0.03);
  b.box(m.trim, w / 2, -h / 2 - f, 0, w / 2 + f, h / 2 + f, 0.03);
  b.box(m.trim, -w / 2, h / 2, 0, w / 2, h / 2 + f, 0.03);
  b.box(m.trim, -w / 2, -h / 2 - f, 0, w / 2, -h / 2, 0.03);
  if (opts.cross !== false) {
    b.box(m.trim, -0.011, -h / 2, 0.004, 0.011, h / 2, 0.022);
    b.box(m.trim, -w / 2, h * 0.12 - 0.011, 0.004, w / 2, h * 0.12 + 0.011, 0.022);
  }
  if (opts.sill !== false) b.box(opts.sillMat ?? m.bluestone, -w / 2 - 0.05, -h / 2 - f - 0.035, 0, w / 2 + 0.05, -h / 2 - f, 0.06);
}

function movingBox(b: Builder, k: Kit, w: number, h: number, d: number, m4: THREE.Matrix4): void {
  b.at(m4, () => {
    b.add(G.rbox(w, h, d, 0.014, 1), k.mat.cardboard, M(0, h / 2, 0));
    const tw = 0.055;
    b.box(k.mat.tape, -w / 2 - 0.002, h - 0.001, -tw / 2, w / 2 + 0.002, h + 0.004, tw / 2);
    b.box(k.mat.tape, -w / 2 - 0.004, h * 0.62, -tw / 2, -w / 2 + 0.001, h, tw / 2);
    b.box(k.mat.tape, w / 2 - 0.001, h * 0.62, -tw / 2, w / 2 + 0.004, h, tw / 2);
    // shipping label
    b.box(k.mat.trim, -w * 0.32, h * 0.42, d / 2 - 0.001, -w * 0.06, h * 0.62, d / 2 + 0.003);
  });
}

function hedgeArc(b: Builder, mat: THREE.Material, rad: number, a0: number, a1: number, h: number, d: number): void {
  const n = Math.max(6, Math.ceil(((a1 - a0) * rad) / 0.05));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([(rad + d / 2) * Math.cos(a), (rad + d / 2) * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([(rad - d / 2) * Math.cos(a), (rad - d / 2) * Math.sin(a)]);
  }
  b.add(prism(pts, 0.035, h - 0.035, { size: 0.03, thickness: 0.035 }), mat);
}

function bistroTable(b: Builder, k: Kit, x: number, z: number): void {
  const m = k.mat;
  b.add(G.cyl(0.15, 0.15, 0.022, 28), m.trim, M(x, 0.46, z));
  b.add(G.cyl(0.155, 0.155, 0.008, 28), m.iron, M(x, 0.447, z));
  b.add(G.cyl(0.014, 0.014, 0.44, 8), m.iron, M(x, 0.23, z));
  b.add(G.cyl(0.075, 0.09, 0.02, 20), m.iron, M(x, 0.01, z));
}

function bistroChair(b: Builder, k: Kit, x: number, z: number, face: number): void {
  const m = k.mat;
  b.at(M(x, 0, z, 0, face, 0), () => {
    b.add(G.cyl(0.085, 0.085, 0.022, 18), m.woodDark, M(0, 0.29, 0));
    for (const [lx, lz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) {
      b.add(G.cyl(0.008, 0.008, 0.29, 6), m.iron, M(lx * 1.08, 0.145, lz * 1.08, lz * 0.12, 0, -lx * 0.12));
    }
    // bentwood back on the -z side, facing +z
    b.add(G.torus(0.07, 0.009, 6, 18, Math.PI), m.woodDark, M(0, 0.42, -0.075, 0, 0, 0));
    b.add(G.cyl(0.009, 0.009, 0.13, 6), m.woodDark, M(-0.07, 0.355, -0.075));
    b.add(G.cyl(0.009, 0.009, 0.13, 6), m.woodDark, M(0.07, 0.355, -0.075));
    b.add(G.torus(0.045, 0.006, 5, 14, Math.PI), m.woodDark, M(0, 0.38, -0.075));
  });
}

// ───────────────────────────── house (Thomas, first home) ─────────────────────────────

function sceneHouse(c: Ctx): SceneOut {
  const k = c.kit;
  const m = k.mat;
  const b = new Builder();
  const zF = 0.05; // facade front plane
  const TH = 0.1;
  const HW = 0.72;
  const EAVE = 1.37;
  const RIDGE = 2.18;

  // Facade: crow-stepped gable (Ghent), openings cut so the reveals have depth.
  const xs = [0.72, 0.58, 0.44, 0.3, 0.16];
  const ys = [1.56, 1.78, 2.0, 2.22, 2.44];
  const sh = new THREE.Shape();
  sh.moveTo(-HW, 0);
  sh.lineTo(HW, 0);
  for (let i = 0; i < 5; i++) {
    sh.lineTo(xs[i], ys[i]);
    sh.lineTo(i < 4 ? xs[i + 1] : -xs[4], ys[i]);
  }
  for (let i = 4; i >= 1; i--) {
    sh.lineTo(-xs[i], ys[i - 1]);
    sh.lineTo(-xs[i - 1], ys[i - 1]);
  }
  sh.lineTo(-HW, 0);
  const WIN = { x0: -0.52, x1: -0.1, y0: 0.56, y1: 1.28 };
  const DOOR = { x0: 0.16, x1: 0.48, y0: 0.1, y1: 1.04 };
  const ATTIC = { x0: -0.15, x1: 0.15, y0: 1.55, y1: 1.93 };
  sh.holes.push(rectPath(WIN.x0, WIN.y0, WIN.x1, WIN.y1), rectPath(DOOR.x0, DOOR.y0, DOOR.x1, DOOR.y1), rectPath(ATTIC.x0, ATTIC.y0, ATTIC.x1, ATTIC.y1));
  const oc = new THREE.Path();
  oc.absarc(0, 2.17, 0.07, 0, Math.PI * 2, true);
  sh.holes.push(oc);
  b.add(slab(sh, TH), m.brick, M(0, 0, zF));

  // Body, back gable, side walls.
  b.box(m.brick, -HW, 0, -1.15, HW, EAVE, zF - TH);
  const tri = new THREE.Shape([new THREE.Vector2(-HW, EAVE - 0.01), new THREE.Vector2(HW, EAVE - 0.01), new THREE.Vector2(0, RIDGE - 0.02)]);
  b.add(slab(tri, 0.08), m.brick, M(0, 0, -1.07));

  // Bluestone socle, sills, step; white speklagen bands, lintels, coping.
  b.box(m.bluestone, -HW - 0.012, 0, zF - 0.02, HW + 0.012, 0.1, zF + 0.016);
  b.box(m.bluestone, -HW - 0.012, 0, -1.16, -HW + 0.02, 0.1, zF - 0.02);
  b.box(m.bluestone, HW - 0.02, 0, -1.16, HW + 0.012, 0.1, zF - 0.02);
  b.box(m.bluestone, WIN.x0 - 0.05, WIN.y0 - 0.04, zF - 0.03, WIN.x1 + 0.05, WIN.y0, zF + 0.05);
  b.box(m.bluestone, ATTIC.x0 - 0.04, ATTIC.y0 - 0.035, zF - 0.03, ATTIC.x1 + 0.04, ATTIC.y0, zF + 0.04);
  b.add(G.rbox(0.44, 0.08, 0.17, 0.012), m.bluestone, M((DOOR.x0 + DOOR.x1) / 2, 0.04, zF + 0.085));
  b.box(m.trim, -HW - 0.01, EAVE, zF - 0.02, HW + 0.01, EAVE + 0.04, zF + 0.014);
  b.box(m.trim, -0.44, 1.96, zF - 0.02, 0.44, 1.985, zF + 0.012);
  b.box(m.trim, WIN.x0 - 0.04, WIN.y1, zF - 0.02, WIN.x1 + 0.04, WIN.y1 + 0.05, zF + 0.02);
  b.box(m.trim, (WIN.x0 + WIN.x1) / 2 - 0.035, WIN.y1 - 0.01, zF - 0.02, (WIN.x0 + WIN.x1) / 2 + 0.035, WIN.y1 + 0.075, zF + 0.03);
  b.box(m.trim, DOOR.x0 - 0.035, DOOR.y1, zF - 0.02, DOOR.x1 + 0.035, DOOR.y1 + 0.045, zF + 0.018);
  for (let i = 0; i < 5; i++) {
    const x0 = i < 4 ? xs[i + 1] : -xs[4];
    const x1 = xs[i];
    const w = x1 - x0 + 0.04;
    for (const sgn of i < 4 ? [1, -1] : [1]) {
      b.box(m.trim, sgn * ((x0 + x1) / 2) - w / 2, ys[i], zF - TH - 0.02, sgn * ((x0 + x1) / 2) + w / 2, ys[i] + 0.035, zF + 0.02);
    }
  }
  b.add(G.sphere(0.045, 12, 8), m.trim, M(0, 2.52, zF - TH / 2));
  b.add(G.cyl(0.03, 0.04, 0.03, 10), m.trim, M(0, 2.49, zF - TH / 2));

  // Hero window: frame + transom; the main pane is the window mesh (no bars across it).
  frameOpening(b, m.trim, WIN.x0, WIN.y0, WIN.x1, WIN.y1, zF, 0.03, 0.04, 0.025);
  b.box(m.trim, WIN.x0 + 0.03, 1.1, zF - 0.065, WIN.x1 - 0.03, 1.13, zF - 0.025);
  b.box(m.trim, -0.32, 1.13, zF - 0.06, -0.3, WIN.y1 - 0.03, zF - 0.03);
  const winMat = c.glow(WARM, 1.45, { map: k.windowTex });
  const window = new THREE.Mesh(G.plane(0.36, 0.51), winMat);
  window.position.set(-0.31, 0.845, zF - 0.06);
  window.name = "window";
  c.root.add(window);
  const warm = c.glow(WARM, 1.05);
  b.add(G.plane(0.17, 0.12), warm, M(-0.405, 1.19, zF - 0.062));
  b.add(G.plane(0.17, 0.12), warm, M(-0.215, 1.19, zF - 0.062));

  // Door: night-blue panelled leaf, fanlight, brass knob, number plate in the KBC accent.
  frameOpening(b, m.trim, DOOR.x0, DOOR.y0, DOOR.x1, DOOR.y1, zF, 0.028, 0.04, 0.02);
  b.box(m.trim, DOOR.x0 + 0.028, 0.9, zF - 0.06, DOOR.x1 - 0.028, 0.925, zF - 0.02);
  b.add(G.plane(0.26, 0.085), warm, M(0.32, 0.97, zF - 0.058));
  b.box(m.door, DOOR.x0 + 0.028, DOOR.y0, zF - 0.075, DOOR.x1 - 0.028, 0.9, zF - 0.045);
  b.box(m.door, 0.215, 0.56, zF - 0.046, 0.425, 0.84, zF - 0.036, 0.008);
  b.box(m.door, 0.215, 0.17, zF - 0.046, 0.425, 0.5, zF - 0.036, 0.008);
  b.add(G.sphere(0.017, 10, 8), m.brass, M(0.43, 0.52, zF - 0.03));
  b.box(m.brass, 0.27, 0.53, zF - 0.045, 0.37, 0.548, zF - 0.032);
  // number plate (KBC accent) and wall lantern between the window and the door, clear of Thomas
  b.box(m.accent, -0.015, 0.66, zF, 0.075, 0.725, zF + 0.012, 0.006);
  b.box(m.iron, 0.01, 0.84, zF, 0.05, 0.86, zF + 0.05);
  b.box(m.iron, -0.005, 0.86, zF + 0.02, 0.065, 0.88, zF + 0.09);
  b.add(G.box(0.05, 0.075, 0.05), warm, M(0.03, 0.92, zF + 0.055));
  b.add(G.cyl(0.0, 0.05, 0.035, 4), m.iron, M(0.03, 0.975, zF + 0.055, 0, Math.PI / 4, 0));

  // Attic window and oculus (dark glass).
  frameOpening(b, m.trim, ATTIC.x0, ATTIC.y0, ATTIC.x1, ATTIC.y1, zF, 0.028, 0.04, 0.025);
  b.box(m.trim, -0.011, ATTIC.y0, zF - 0.06, 0.011, ATTIC.y1, zF - 0.035);
  b.box(m.trim, ATTIC.x0, 1.79, zF - 0.06, ATTIC.x1, 1.81, zF - 0.035);
  b.add(G.plane(0.26, 0.36), m.glass, M(0, 1.74, zF - 0.065));
  b.add(G.circle(0.07, 24), m.glass, M(0, 2.17, zF - 0.06));
  b.add(G.torus(0.064, 0.011, 6, 24), m.trim, M(0, 2.17, zF - 0.035));

  // Side and back windows (seen while the turntable sways).
  b.at(M(HW, 0.85, -0.62, 0, Math.PI / 2, 0), () => appliedWindow(b, k, 0.26, 0.4));
  b.at(M(-HW, 0.85, -0.62, 0, -Math.PI / 2, 0), () => appliedWindow(b, k, 0.26, 0.4));
  b.at(M(-0.3, 0.75, -1.15, 0, Math.PI, 0), () => appliedWindow(b, k, 0.3, 0.42));
  b.at(M(0.3, 0.75, -1.15, 0, Math.PI, 0), () => appliedWindow(b, k, 0.3, 0.42));

  // Roof: slate slabs with tile courses, zinc ridge, gutters and downpipes, chimney.
  const run = 0.78;
  const rise = RIDGE - (EAVE - 0.02);
  const L = Math.hypot(run, rise);
  const a = Math.atan2(rise, run);
  const z0 = zF - TH;
  const z1 = -1.24;
  const depth = z0 - z1;
  const zc = (z0 + z1) / 2;
  for (const sgn of [1, -1]) {
    const dir = new THREE.Vector2(sgn * Math.cos(a), -Math.sin(a));
    const nrm = new THREE.Vector2(sgn * Math.sin(a), Math.cos(a));
    const mid = new THREE.Vector2(0, RIDGE).addScaledVector(dir, L / 2).addScaledVector(nrm, 0.025);
    b.add(G.box(L + 0.02, 0.05, depth), m.slate, M(mid.x, mid.y, zc, 0, 0, -sgn * a));
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const s = ((i + 0.55) / rows) * L;
      const p = new THREE.Vector2(0, RIDGE).addScaledVector(dir, s).addScaledVector(nrm, 0.058);
      b.add(G.box(L / rows + 0.035, 0.016, depth + 0.01), m.slate, M(p.x, p.y, zc, 0, 0, -sgn * (a - 0.06)));
    }
    b.add(G.cyl(0.026, 0.026, depth + 0.02, 10), m.zinc, M(sgn * (run + 0.03), EAVE - 0.035, zc, Math.PI / 2, 0, 0));
    b.add(G.cyl(0.016, 0.016, EAVE, 8), m.zinc, M(sgn * (run + 0.01), EAVE / 2, -1.17));
  }
  b.add(G.box(0.075, 0.075, depth + 0.02), m.zinc, M(0, RIDGE + 0.055, zc, 0, 0, Math.PI / 4));
  b.box(m.brick, -0.47, 1.62, -1.02, -0.27, 2.28, -0.84);
  b.box(m.trim, -0.49, 2.28, -1.04, -0.25, 2.32, -0.82);
  b.add(G.cyl(0.028, 0.034, 0.08, 10), m.bluestone, M(-0.415, 2.36, -0.93));
  b.add(G.cyl(0.028, 0.034, 0.08, 10), m.bluestone, M(-0.325, 2.36, -0.93));

  // Garden: stepping-stone path, low curved hedge, moving boxes, FOR SALE sign.
  const r = rand(3);
  for (let i = 0; i < 6; i++) {
    const z = 0.32 + i * 0.205;
    b.add(G.rbox(0.3 - r() * 0.04, 0.03, 0.15, 0.014, 1), m.paving, M(0.32 + (r() - 0.5) * 0.05, 0.012, z, 0, (r() - 0.5) * 0.16, 0));
  }
  hedgeArc(b, m.foliage, 1.43, (83 * Math.PI) / 180, (146 * Math.PI) / 180, 0.2, 0.14);
  movingBox(b, k, 0.36, 0.26, 0.3, M(1.1, 0, -0.12, 0, 0.32, 0));
  movingBox(b, k, 0.3, 0.21, 0.26, M(1.08, 0.26, -0.13, 0, 0.08, 0));
  movingBox(b, k, 0.25, 0.19, 0.22, M(1.3, 0, 0.26, 0, -0.42, 0));
  movingBox(b, k, 0.2, 0.15, 0.18, M(1.32, 0.19, 0.25, 0, -0.2, 0));
  // potted bay tree next to the boxes
  b.add(G.cyl(0.075, 0.06, 0.13, 14), m.iron, M(-0.62, 0.065, 0.24));
  b.add(G.cyl(0.006, 0.006, 0.22, 5), m.bark, M(-0.62, 0.22, 0.24));
  b.add(G.ico(0.11, 2), m.foliage, M(-0.62, 0.38, 0.24, 0, 0, 0, 1, 0.95, 1));

  // FOR SALE sign: post with an arm, the board hangs and swings slightly.
  const post = { x: -1.2, z: 0.5 };
  b.box(m.trim, post.x - 0.028, 0, post.z - 0.028, post.x + 0.028, 1.28, post.z + 0.028, 0.006);
  b.box(m.trim, post.x - 0.03, 1.22, post.z - 0.022, post.x + 0.52, 1.262, post.z + 0.022, 0.006);
  b.add(G.cyl(0.0, 0.04, 0.05, 4), m.trim, M(post.x, 1.305, post.z, 0, Math.PI / 4, 0));
  b.add(G.box(0.012, 0.16, 0.012), m.trim, M(post.x + 0.11, 1.17, post.z, 0, 0, -0.7));
  const signTex = c.text(512, 368, (g, font) => {
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, 512, 368);
    g.strokeStyle = NAVY;
    g.lineWidth = 18;
    g.strokeRect(9, 9, 494, 350);
    g.fillStyle = NAVY;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const fit = (txt: string, px: number, max: number) => {
      g.font = font(px, 800);
      const w = g.measureText(txt).width;
      if (w > max) g.font = font((px * max) / w, 800);
    };
    fit("FOR", 128, 420);
    g.fillText("FOR", 256, 108);
    fit("SALE", 150, 430);
    g.fillText("SALE", 256, 232);
    g.fillStyle = ACCENT;
    g.fillRect(150, 312, 212, 12);
  });
  const signMat = c.own(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 }));
  const swing = new THREE.Group();
  swing.position.set(post.x + 0.3, 1.215, post.z);
  const sb = new Builder();
  sb.add(G.box(0.46, 0.33, 0.016), signMat, M(0, -0.215, 0));
  sb.add(G.torus(0.014, 0.004, 4, 10), m.iron, M(-0.17, -0.035, 0));
  sb.add(G.torus(0.014, 0.004, 4, 10), m.iron, M(0.17, -0.035, 0));
  sb.add(G.box(0.006, 0.03, 0.006), m.iron, M(-0.17, -0.06, 0));
  sb.add(G.box(0.006, 0.03, 0.006), m.iron, M(0.17, -0.06, 0));
  sb.build(swing);
  c.root.add(swing);
  c.anim.push((t) => {
    swing.rotation.x = sway(t, 0.07);
  });

  // Ground: lawn, gravel under the path, contact shading under everything.
  const ground = c.ground((g, X, Z, S, rr) => {
    paintLawn(g, S, rr, "#35523f");
    g.fillStyle = "#8c8478";
    soft(g, 3, "rgba(140,132,120,0.9)", (h) => {
      roundRect(h, X(0.12), Z(0.12), X(0.52) - X(0.12), Z(1.62) - Z(0.12), 6);
      h.fill();
    });
    for (let i = 0; i < 900; i++) {
      g.fillStyle = tint("#8c8478", 0.7 + rr() * 0.6, 0.8);
      g.fillRect(X(0.14) + rr() * (X(0.5) - X(0.14)), Z(0.14) + rr() * (Z(1.6) - Z(0.14)), 1.5, 1.5);
    }
    aoRect(g, X, Z, -0.78, -1.22, 0.78, zF + 0.02, 16, 0.75);
    aoRect(g, X, Z, 0.88, -0.32, 1.32, 0.06, 10, 0.55);
    aoRect(g, X, Z, 1.16, 0.12, 1.46, 0.4, 9, 0.5);
    aoDisc(g, X, Z, -0.62, 0.24, 0.09, 6, 0.6);
    aoDisc(g, X, Z, post.x, post.z, 0.05, 5, 0.6);
    soft(g, 8, "rgba(6,10,18,0.5)", (h) => {
      h.lineWidth = 22;
      h.beginPath();
      h.arc(S / 2, S / 2, (1.43 / (2 * GROUND_HALF)) * S, (83 * Math.PI) / 180, (146 * Math.PI) / 180);
      h.stroke();
    });
  }, 21);
  c.pool(b, 0.32, [[-0.31, zF + 0.34, 1.0, 0.62], [0.05, zF + 0.2, 0.46, 0.32]]);
  addPlinth(b, k, ground);
  b.build(c.root);
  return { window, stand: [0.68, 0, 1.08], standRotY: -0.3, padlock: [0, 2.44, 0.42] };
}

// ───────────────────────────── coffee bar (Lina, first business) ─────────────────────────────

function sceneBusiness(c: Ctx): SceneOut {
  const k = c.kit;
  const m = k.mat;
  const b = new Builder();
  const GF = 1.64; // ground-floor height
  const R2 = Math.SQRT2 - 1;
  const foot = (d: number): [number, number][] => [
    [-0.72 - d, 0.08 + d],
    [0.6 + d * R2, 0.08 + d],
    [0.86 + d, -0.18 + d * R2],
    [0.86 + d, -1.08 - d],
    [-0.72 - d, -1.08 - d],
  ];
  const zF = 0.08;

  // Upper floor in cream render, cornice, mansard in slate, chimney.
  b.add(prism(foot(0), GF, 2.34), m.render);
  b.add(prism(foot(0.012), GF - 0.03, GF + 0.02), m.trim);
  b.add(prism(foot(0.04), 2.34, 2.41), m.trim);
  b.add(prism(foot(0.012), 2.31, 2.34), m.trim);
  b.add(prism(foot(0), 2.41, 2.411, { size: 0.2, thickness: 0.22, offset: -0.2 }), m.slate);
  b.box(m.render, -0.5, 2.4, -0.82, -0.28, 2.74, -0.64);
  b.box(m.trim, -0.52, 2.74, -0.84, -0.26, 2.775, -0.62);
  b.add(G.cyl(0.035, 0.04, 0.06, 10), m.slate, M(-0.44, 2.8, -0.73));
  b.add(G.cyl(0.035, 0.04, 0.06, 10), m.slate, M(-0.34, 2.8, -0.73));

  // Ground floor: night-blue shopfront on the front, the chamfered corner and the right side.
  const PANE = { y0: 0.56, y1: 1.22 };
  const panes: [number, number][] = [[-0.62, -0.27], [-0.22, 0.22], [0.27, 0.53]];
  const front = new THREE.Shape();
  front.moveTo(-0.72, 0);
  front.lineTo(0.6, 0);
  front.lineTo(0.6, GF);
  front.lineTo(-0.72, GF);
  front.closePath();
  for (const [x0, x1] of panes) front.holes.push(rectPath(x0, PANE.y0, x1, PANE.y1));
  b.add(slab(front, 0.08), m.shop, M(0, 0, zF));
  // corner slab with the door
  const cw = 0.26 * Math.SQRT2;
  const corner = new THREE.Shape();
  corner.moveTo(-cw / 2, 0);
  corner.lineTo(cw / 2, 0);
  corner.lineTo(cw / 2, GF);
  corner.lineTo(-cw / 2, GF);
  corner.closePath();
  corner.holes.push(rectPath(-0.13, 0.05, 0.13, 1.03), rectPath(-0.13, 1.07, 0.13, 1.22));
  const cornerM = M(0.73, 0, -0.05, 0, Math.PI / 4, 0);
  b.at(cornerM, () => {
    b.add(slab(corner, 0.08), m.shop);
    frameOpening(b, m.trim, -0.13, 0.05, 0.13, 1.03, 0, 0.026, 0.04, 0.03);
    frameOpening(b, m.trim, -0.13, 1.07, 0.13, 1.22, 0, 0.022, 0.04, 0.03);
    b.box(m.shop, -0.104, 0.05, -0.07, 0.104, 0.4, -0.045);
    b.box(m.trim, -0.104, 0.4, -0.07, 0.104, 0.425, -0.04);
    b.box(m.chrome, 0.06, 0.48, -0.04, 0.072, 0.68, -0.025);
    b.box(m.slate, -0.17, 0, 0, 0.17, 0.05, 0.1);
  });
  b.box(m.shop, -0.72, 0, -0.38, -0.64, GF, zF - 0.08);
  b.box(m.shop, 0.78, 0, -0.38, 0.86, GF, -0.18);
  b.box(m.shop, -0.72, 0, -1.08, 0.86, GF, -0.38);
  b.box(m.shop, 0.56, 0, -0.02, 0.64, GF, zF + 0.012); // corner pier
  // stall risers, sill moulding, skirting, capitals
  for (const [x0, x1] of panes) b.box(m.shop, x0 + 0.04, 0.12, zF, x1 - 0.04, 0.46, zF + 0.012, 0.006);
  b.box(m.trim, -0.74, 0.5, zF - 0.01, 0.6, 0.56, zF + 0.035);
  b.box(m.slate, -0.73, 0, zF - 0.01, 0.6, 0.07, zF + 0.02);
  b.box(m.trim, -0.74, 1.22, zF - 0.01, 0.6, 1.27, zF + 0.025);
  for (const [x0, x1] of panes) frameOpening(b, m.trim, x0, PANE.y0, x1, PANE.y1, zF, 0.018, 0.03, 0.025);

  // Side window on the right (shows the painted interior).
  b.at(M(0.86, 0.89, -0.66, 0, Math.PI / 2, 0), () => {
    b.box(m.trim, -0.27, -0.36, 0, -0.24, 0.36, 0.03);
    b.box(m.trim, 0.24, -0.36, 0, 0.27, 0.36, 0.03);
    b.box(m.trim, -0.24, 0.33, 0, 0.24, 0.36, 0.03);
    b.box(m.trim, -0.29, -0.4, 0, 0.29, -0.33, 0.045);
    b.box(m.trim, -0.012, -0.33, 0.002, 0.012, 0.33, 0.022);
  });

  // Interior seen through the glass: lit back wall, counter, espresso machine, grinder, pendants.
  const interiorTex = c.tex(canvasTexture(paintInterior()));
  const interior = c.glow("#ffd9ae", 1.0, { map: interiorTex, lockAs: "dim" });
  b.add(G.plane(1.42, GF), interior, M(0.07, GF / 2, -0.375));
  b.add(G.plane(0.48, 0.66), interior, M(0.866, 0.89, -0.66, 0, Math.PI / 2, 0));
  b.at(cornerM, () => {
    b.add(G.plane(0.21, 0.6), interior, M(0, 0.72, -0.06));
    b.add(G.plane(0.21, 0.11), interior, M(0, 1.145, -0.06));
  });
  b.box(m.woodDark, -0.64, 0, -0.38, 0.78, 0.04, zF - 0.08);
  b.box(m.woodDark, -0.5, 0.04, -0.33, 0.5, 0.58, -0.15);
  for (let i = 0; i < 6; i++) b.box(m.woodDark, -0.49 + i * 0.165, 0.08, -0.152, -0.49 + i * 0.165 + 0.012, 0.55, -0.145);
  b.box(m.trim, -0.52, 0.58, -0.345, 0.52, 0.6, -0.13);
  // espresso machine (chrome, domed top, two group heads, amber gauge + lights)
  const amber = c.glow(AMBER, 2.4);
  b.at(M(0, 0.6, -0.24), () => {
    b.box(m.iron, -0.22, 0, -0.08, 0.22, 0.03, 0.1);
    b.add(G.rbox(0.42, 0.22, 0.16, 0.035, 2), m.chrome, M(0, 0.14, -0.005));
    b.box(m.shop, -0.2, 0.15, 0.074, 0.2, 0.215, 0.08);
    b.add(G.sphere(0.085, 18, 8), m.chrome, M(0, 0.25, -0.01, 0, 0, 0, 1, 0.8, 1));
    b.add(G.cyl(0.014, 0.022, 0.035, 10), m.chrome, M(0, 0.33, -0.01));
    for (const gx of [-0.1, 0.1]) {
      b.add(G.cyl(0.034, 0.038, 0.04, 14), m.chrome, M(gx, 0.085, 0.085));
      b.add(G.cyl(0.01, 0.01, 0.1, 6), m.iron, M(gx, 0.065, 0.14, Math.PI / 2 - 0.25, 0, 0));
      b.add(G.cyl(0.026, 0.02, 0.034, 10), m.trim, M(gx, 0.045, 0.09));
    }
    b.add(G.cyl(0.028, 0.028, 0.008, 18), amber, M(0, 0.183, 0.082, Math.PI / 2, 0, 0));
    b.add(G.sphere(0.011, 8, 6), amber, M(-0.15, 0.183, 0.082));
    b.add(G.sphere(0.011, 8, 6), amber, M(0.15, 0.183, 0.082));
    b.add(G.cyl(0.007, 0.007, 0.14, 6), m.chrome, M(0.235, 0.1, 0.03, 0, 0, 0.35));
    for (const cx of [-0.15, -0.09, 0.09, 0.15]) b.add(G.cyl(0.02, 0.015, 0.03, 10), m.trim, M(cx, 0.265, -0.03));
  });
  b.at(M(0.36, 0.6, -0.25), () => {
    b.add(G.rbox(0.09, 0.16, 0.1, 0.015), m.iron, M(0, 0.08, 0));
    b.add(G.cyl(0.05, 0.022, 0.1, 12), m.glass, M(0, 0.21, 0));
  });
  for (const px of [-0.42, 0.4]) {
    b.add(G.cyl(0.003, 0.003, GF - 1.16, 4), m.iron, M(px, (GF + 1.16) / 2, -0.17));
    b.add(G.cyl(0.026, 0.065, 0.055, 16, true), m.chrome, M(px, 1.135, -0.17));
    b.add(G.sphere(0.022, 10, 8), amber, M(px, 1.11, -0.17));
  }

  // Glass: the centre pane is the window mesh (additive warm sheen over the interior).
  const glassTex = c.tex(canvasTexture(paintGlass()));
  const glass = c.glow(WARM, 0.55, { map: glassTex, additive: true });
  const window = new THREE.Mesh(G.plane(0.44, PANE.y1 - PANE.y0), glass);
  window.position.set(0, (PANE.y0 + PANE.y1) / 2, zF - 0.04);
  window.name = "window";
  c.root.add(window);
  b.add(G.plane(0.35, PANE.y1 - PANE.y0), glass, M(-0.445, (PANE.y0 + PANE.y1) / 2, zF - 0.04));
  b.add(G.plane(0.26, PANE.y1 - PANE.y0), glass, M(0.4, (PANE.y0 + PANE.y1) / 2, zF - 0.04));

  // Fascia with the name, striped awning, cup sign.
  const fasciaTex = c.text(1024, 144, (g, font) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 1024, 144);
    g.strokeStyle = "rgba(239,230,214,0.85)";
    g.lineWidth = 4;
    g.strokeRect(14, 14, 996, 116);
    g.fillStyle = "#f1e7d6";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = font(78, 800);
    g.letterSpacing = "10px";
    g.fillText("LINA'S COFFEE", 512, 76);
  });
  const fascia = c.own(new THREE.MeshStandardMaterial({ map: fasciaTex, roughness: 0.42 }));
  b.add(G.box(1.26, 0.17, 0.026), fascia, M(-0.06, 1.54, zF + 0.013));
  b.box(m.trim, -0.74, 1.445, zF - 0.01, 0.6, 1.455, zF + 0.035);
  // awning: sloped canvas, scalloped valance, folding arms
  const AW = { x0: -0.66, x1: 0.56, y0: 1.43, y1: 1.31, z1: zF + 0.32 };
  const awLen = Math.hypot(AW.z1 - zF, AW.y0 - AW.y1);
  const awAng = Math.atan2(AW.y0 - AW.y1, AW.z1 - zF);
  const awW = AW.x1 - AW.x0;
  const awX = (AW.x0 + AW.x1) / 2;
  b.add(G.box(awW, 0.01, awLen), m.awning, M(awX, (AW.y0 + AW.y1) / 2, (zF + AW.z1) / 2, awAng, 0, 0));
  const n = Math.round(awW / 0.095);
  const sw = awW / n;
  const valPts = [new THREE.Vector2(-awW / 2, 0), new THREE.Vector2(awW / 2, 0)];
  for (let i = n - 1; i >= 0; i--) {
    const cx = -awW / 2 + (i + 0.5) * sw;
    for (let j = 0; j < 6; j++) {
      const ang = (-j / 6) * Math.PI; // 0 .. -pi: the scallop hangs below
      valPts.push(new THREE.Vector2(cx + (sw / 2) * Math.cos(ang), -0.04 + (sw / 2) * Math.sin(ang)));
    }
  }
  valPts.push(new THREE.Vector2(-awW / 2, -0.04));
  b.add(new THREE.ExtrudeGeometry(new THREE.Shape(valPts), { depth: 0.008, bevelEnabled: false }), m.awning, M(awX, AW.y1 + 0.004, AW.z1 - 0.004));
  b.add(G.cyl(0.011, 0.011, awW + 0.02, 8), m.iron, M(awX, AW.y1, AW.z1, 0, 0, Math.PI / 2));
  b.box(m.iron, AW.x0 - 0.01, AW.y0 - 0.015, zF, AW.x1 + 0.01, AW.y0 + 0.02, zF + 0.03);

  // Cup sign on a bracket at the corner, swinging gently.
  const cn = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const bStart = new THREE.Vector3(0.73, 1.4, -0.05);
  const bEnd = bStart.clone().addScaledVector(cn, 0.3);
  b.at(M(bStart.x, bStart.y, bStart.z, 0, Math.PI / 4, 0), () => {
    b.add(G.cyl(0.011, 0.011, 0.3, 8), m.iron, M(0, 0, 0.15, Math.PI / 2, 0, 0));
    b.add(G.cyl(0.006, 0.006, 0.26, 6), m.iron, M(0, -0.09, 0.12, -1.0, 0, 0));
    b.box(m.iron, -0.035, -0.17, 0, 0.035, 0.05, 0.014);
  });
  const cupSwing = new THREE.Group();
  cupSwing.position.copy(bEnd);
  cupSwing.rotation.order = "YXZ";
  cupSwing.rotation.y = -Math.PI / 4;
  const cb = new Builder();
  const cupPts = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0.075, 0.03), new THREE.Vector2(0.085, 0.1), new THREE.Vector2(0.089, 0.115), new THREE.Vector2(0.078, 0.115), new THREE.Vector2(0.07, 0.04), new THREE.Vector2(0.0, 0.03)];
  cb.add(G.cyl(0.13, 0.115, 0.016, 24), m.trim, M(0, 0.02, 0));
  cb.add(new THREE.LatheGeometry(cupPts, 22), m.trim, M(0, 0.028, 0, 0, 0, 0, 1.25));
  cb.add(G.torus(0.045, 0.014, 6, 14), m.trim, M(0.115, 0.1, 0));
  cb.add(G.cyl(0.02, 0.03, 0.012, 10), m.trim, M(0, 0.006, 0));
  cb.build(cupSwing);
  c.root.add(cupSwing);
  c.anim.push((t) => {
    cupSwing.rotation.z = sway(t + 2, 0.035, 0.9);
  });

  // Upper-floor windows with iron balconettes.
  for (const x of [-0.36, 0.24]) {
    b.at(M(x, 2.0, zF), () => {
      appliedWindow(b, k, 0.24, 0.4, { sill: false });
      b.box(m.trim, -0.16, -0.255, 0, 0.16, -0.225, 0.06);
      b.box(m.iron, -0.15, -0.12, 0.07, 0.15, -0.11, 0.08);
      for (let i = 0; i <= 6; i++) b.box(m.iron, -0.15 + i * 0.05 - 0.003, -0.225, 0.07, -0.15 + i * 0.05 + 0.003, -0.11, 0.076);
    });
  }
  const sillMat = m.trim;
  b.at(M(0.73, 2.0, -0.05, 0, Math.PI / 4, 0), () => appliedWindow(b, k, 0.16, 0.4, { cross: false, sillMat }));
  for (const z of [-0.5, -0.86]) b.at(M(0.86, 2.0, z, 0, Math.PI / 2, 0), () => appliedWindow(b, k, 0.22, 0.38, { sillMat }));
  b.at(M(-0.72, 2.0, -0.5, 0, -Math.PI / 2, 0), () => appliedWindow(b, k, 0.22, 0.38, { sillMat }));
  for (const x of [-0.3, 0.4]) b.at(M(x, 2.0, -1.08, 0, Math.PI, 0), () => appliedWindow(b, k, 0.22, 0.38, { sillMat }));
  for (const x of [-0.36, 0.24]) {
    // dormers on the mansard
    b.box(m.slate, x - 0.11, 2.4, -0.06, x + 0.11, 2.56, 0.05);
    b.at(M(x, 2.47, 0.05), () => appliedWindow(b, k, 0.12, 0.1, { sill: false, cross: false }));
    b.add(G.cyl(0.0, 0.16, 0.08, 4, false), m.slate, M(x, 2.6, -0.005, 0, Math.PI / 4, 0, 1, 1, 0.75));
  }

  // Terrace: two bistro tables with chairs, a cup with steam, the A-frame, a topiary.
  bistroTable(b, k, -0.48, 0.86);
  bistroChair(b, k, -0.72, 0.86, Math.PI / 2);
  bistroChair(b, k, -0.25, 0.9, -Math.PI / 2);
  bistroTable(b, k, 1.16, -0.04);
  bistroChair(b, k, 1.18, -0.28, 0);
  bistroChair(b, k, 1.14, 0.2, Math.PI);
  b.add(G.cyl(0.035, 0.026, 0.05, 14), m.trim, M(-0.45, 0.497, 0.86));
  b.add(G.cyl(0.055, 0.05, 0.008, 18), m.trim, M(-0.45, 0.474, 0.86));
  b.add(G.torus(0.015, 0.005, 5, 10), m.trim, M(-0.41, 0.5, 0.86));
  b.add(G.cyl(0.03, 0.03, 0.002, 12), m.woodDark, M(-0.45, 0.521, 0.86));
  b.add(G.cyl(0.03, 0.022, 0.045, 12), m.trim, M(1.13, 0.495, 0.0));
  // steam wisp (texture scrolls upwards; one draw call)
  const steamTex = c.tex(canvasTexture(paintSteam(), { repeat: true }));
  steamTex.wrapS = THREE.ClampToEdgeWrapping;
  const fadeTex = c.tex(canvasTexture(paintFade(), { color: false }));
  const steamMat = c.own(new THREE.MeshBasicMaterial({ map: steamTex, alphaMap: fadeTex, transparent: true, depthWrite: false, opacity: 0.6, side: THREE.DoubleSide }));
  steamMat.userData.noLock = true;
  const wisp = mergeAll([G.plane(0.08, 0.26), G.plane(0.08, 0.26).rotateY(Math.PI / 2)]);
  const steam = new THREE.Mesh(wisp, steamMat);
  steam.position.set(-0.45, 0.66, 0.86);
  steam.userData.noLock = true;
  steam.userData.hideWhenLocked = true;
  c.root.add(steam);
  c.anim.push((t) => {
    steamTex.offset.y = -t * 0.22;
    steam.rotation.y = t * 0.3;
    steamMat.opacity = 0.45 + 0.15 * Math.sin(t * 1.3);
  });

  const chalkTex = c.text(256, 400, (g, font) => {
    g.fillStyle = "#262c2a";
    g.fillRect(0, 0, 256, 400);
    const r = rand(9);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(230,228,220,${0.03 + r() * 0.05})`;
      g.lineWidth = 6 + r() * 14;
      g.beginPath();
      const x = r() * 256;
      const y = r() * 400;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 90, y + (r() - 0.5) * 40);
      g.stroke();
    }
    g.fillStyle = "#f3efe6";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.save();
    g.translate(128, 120);
    g.rotate(-0.06);
    g.font = font(54, 800);
    g.fillText("COMING", 0, 0);
    g.font = font(70, 800);
    g.fillText("SOON", 0, 62);
    g.restore();
    g.strokeStyle = "#f3efe6";
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(54, 232);
    g.quadraticCurveTo(128, 214, 204, 228);
    g.stroke();
    // cup doodle
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(92, 280);
    g.lineTo(98, 340);
    g.quadraticCurveTo(128, 352, 158, 340);
    g.lineTo(164, 280);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(170, 305, 14, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.lineWidth = 4;
    for (const sx of [112, 128, 144]) {
      g.beginPath();
      g.moveTo(sx, 268);
      g.quadraticCurveTo(sx - 8, 254, sx, 242);
      g.stroke();
    }
  });
  const chalk = c.own(new THREE.MeshStandardMaterial({ map: chalkTex, roughness: 0.9 }));
  b.at(M(0.2, 0, 0.92, 0, -0.18, 0), () => {
    for (const sgn of [1, -1]) {
      b.at(M(0, 0.29, sgn * 0.06, sgn * -0.2, 0, 0), () => {
        b.add(G.box(0.3, 0.46, 0.012), chalk, M(0, 0, 0));
        b.box(m.woodDark, -0.17, -0.29, -0.012, -0.15, 0.27, 0.012);
        b.box(m.woodDark, 0.15, -0.29, -0.012, 0.17, 0.27, 0.012);
        b.box(m.woodDark, -0.17, 0.23, -0.012, 0.17, 0.27, 0.012);
        b.box(m.woodDark, -0.15, -0.25, -0.01, 0.15, -0.23, 0.01);
      });
    }
  });

  // Ground: pale stone tiles, cobbled street strip at the front, contact shading.
  const ground = c.ground((g, X, Z, S, rr) => {
    g.fillStyle = "#9f988c";
    g.fillRect(0, 0, S, S);
    const t = 0.2;
    for (let gx = -GROUND_HALF; gx < GROUND_HALF; gx += t) {
      for (let gz = -GROUND_HALF; gz < 1.12; gz += t) {
        g.fillStyle = tint("#a59e92", 0.9 + rr() * 0.16);
        g.fillRect(X(gx) + 1, Z(gz) + 1, X(gx + t) - X(gx) - 2, Z(gz + t) - Z(gz) - 2);
      }
    }
    g.fillStyle = "#c9c2b6";
    g.fillRect(0, Z(1.12), S, Z(1.18) - Z(1.12));
    g.fillStyle = "#5f5b55";
    g.fillRect(0, Z(1.18), S, S - Z(1.18));
    for (let gz = 1.19; gz < GROUND_HALF; gz += 0.06) {
      const off = (Math.round(gz / 0.06) % 2) * 0.04;
      for (let gx = -GROUND_HALF - off; gx < GROUND_HALF; gx += 0.08) {
        g.fillStyle = tint("#7c766d", 0.82 + rr() * 0.3);
        roundRect(g, X(gx) + 1, Z(gz) + 1, X(gx + 0.08) - X(gx) - 2, Z(gz + 0.06) - Z(gz) - 2, 3);
        g.fill();
      }
    }
    aoRect(g, X, Z, -0.78, -1.14, 0.92, zF + 0.03, 16, 0.75);
    aoDisc(g, X, Z, -0.48, 0.86, 0.17, 8, 0.45);
    aoDisc(g, X, Z, 1.16, -0.04, 0.17, 8, 0.45);
    aoRect(g, X, Z, 0.02, 0.82, 0.38, 1.02, 8, 0.5);
  }, 17);
  c.pool(b, 0.3, [[-0.04, zF + 0.36, 1.5, 0.66], [1.16, -0.66, 0.7, 0.5, Math.PI / 2]]);
  addPlinth(b, k, ground);
  b.build(c.root);
  return { window, stand: [0.66, 0, 1.02], standRotY: -0.3, padlock: [0, 2.44, 0.45] };
}

function paintInterior(): HTMLCanvasElement {
  const W = 512;
  const H = 600;
  const { c, g } = makeCanvas(W, H);
  const X = (x: number) => ((x + 0.64) / 1.42) * W;
  const Y = (y: number) => ((1.64 - y) / 1.64) * H;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fff6ea");
  bg.addColorStop(0.5, "#f0d9bd");
  bg.addColorStop(1, "#7d5f49");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (const px of [-0.42, 0.4]) {
    const gr = g.createRadialGradient(X(px), Y(1.02), 4, X(px), Y(1.0), 150);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  // subway tiles behind the counter
  g.fillStyle = "#f4ece2";
  g.fillRect(0, Y(1.0), W, Y(0.58) - Y(1.0));
  g.strokeStyle = "rgba(120,90,70,0.35)";
  g.lineWidth = 1.5;
  for (let y = 0.58, row = 0; y < 1.0; y += 0.04, row++) {
    g.beginPath();
    g.moveTo(0, Y(y));
    g.lineTo(W, Y(y));
    g.stroke();
    for (let x = -0.64 + (row % 2) * 0.04; x < 0.8; x += 0.08) {
      g.beginPath();
      g.moveTo(X(x), Y(y));
      g.lineTo(X(x), Y(y + 0.04));
      g.stroke();
    }
  }
  // menu board behind the left pane
  g.fillStyle = "#2a2522";
  roundRect(g, X(-0.6), Y(1.2), X(-0.3) - X(-0.6), Y(0.86) - Y(1.2), 4);
  g.fill();
  g.fillStyle = "rgba(245,235,220,0.8)";
  for (let i = 0; i < 6; i++) {
    const y = Y(1.15 - i * 0.048);
    g.fillRect(X(-0.57), y, X(-0.42) - X(-0.57) - (i % 3) * 6, 3);
    g.fillRect(X(-0.37), y, X(-0.33) - X(-0.37), 3);
  }
  // shelves with cups and jars behind the right pane
  const r = rand(4);
  for (const sy of [0.98, 1.14]) {
    g.fillStyle = "#5a3d2a";
    g.fillRect(X(0.24), Y(sy), X(0.62) - X(0.24), 6);
    for (let x = 0.26; x < 0.6; x += 0.05 + r() * 0.02) {
      const h = 0.04 + r() * 0.05;
      g.fillStyle = r() < 0.5 ? "#fbf6ee" : "#6b4a33";
      roundRect(g, X(x), Y(sy + h), X(x + 0.035) - X(x), Y(sy) - Y(sy + h), 3);
      g.fill();
    }
  }
  // a framed print above the machine
  g.fillStyle = "#3c2b20";
  g.fillRect(X(-0.14), Y(1.2), X(0.12) - X(-0.14), Y(1.04) - Y(1.2));
  g.fillStyle = "#e9d2b2";
  g.fillRect(X(-0.12), Y(1.18), X(0.1) - X(-0.12), Y(1.06) - Y(1.18));
  g.fillStyle = "#c58f5e";
  g.beginPath();
  g.arc((X(-0.12) + X(0.1)) / 2, (Y(1.18) + Y(1.06)) / 2, 14, 0, Math.PI * 2);
  g.fill();
  return c;
}

function paintGlass(): HTMLCanvasElement {
  const W = 64;
  const H = 96;
  const { c, g } = makeCanvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#9a9a9a");
  bg.addColorStop(1, "#5c5c5c");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.moveTo(W * 0.55, 0);
  g.lineTo(W * 0.8, 0);
  g.lineTo(W * 0.25, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.2)";
  g.beginPath();
  g.moveTo(W * 0.9, 0);
  g.lineTo(W, 0);
  g.lineTo(W * 0.5, H);
  g.lineTo(W * 0.42, H);
  g.closePath();
  g.fill();
  return c;
}

function paintSteam(): HTMLCanvasElement {
  const W = 64;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  soft(g, 7, "rgba(255,255,255,0.9)", (h) => {
    h.lineWidth = 7;
    h.lineCap = "round";
    for (let pass = -1; pass <= 1; pass++) {
      h.beginPath();
      for (let y = -8; y <= H + 8; y += 4) {
        const x = W / 2 + Math.sin((y / H) * Math.PI * 4) * 11 + Math.sin((y / H) * Math.PI * 2) * 5;
        if (y === -8) h.moveTo(x, y + pass * H);
        else h.lineTo(x, y + pass * H);
      }
      h.stroke();
    }
  });
  return c;
}

function paintFade(): HTMLCanvasElement {
  const { c, g } = makeCanvas(4, 64);
  const gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, "#000");
  gr.addColorStop(0.18, "#fff");
  gr.addColorStop(0.55, "#aaa");
  gr.addColorStop(1, "#000");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  return c;
}

// ───────────────────────────── locked goals ─────────────────────────────

function sceneRetire(c: Ctx): SceneOut {
  const k = c.kit;
  const m = k.mat;
  const b = new Builder();
  const zF = 0.05;
  const W0 = -0.75;
  const W1 = 0.7;
  const EAVE = 1.3;
  const RIDGE = 2.12;
  const zB = -0.95;
  // whitewashed cottage, long side to the front, slate roof, chimney
  b.box(m.render, W0, 0, zB, W1, EAVE, zF);
  for (const x of [W0, W1]) {
    const tri = new THREE.Shape([new THREE.Vector2(zB, EAVE - 0.01), new THREE.Vector2(zF, EAVE - 0.01), new THREE.Vector2((zB + zF) / 2, RIDGE - 0.03)]);
    const g = slab(tri, 0.001);
    g.rotateY(-Math.PI / 2);
    b.add(g, m.render, M(x, 0, 0));
  }
  const run = (zF - zB) / 2 + 0.1;
  const rise = RIDGE - EAVE + 0.06;
  const L = Math.hypot(run, rise);
  const a = Math.atan2(rise, run);
  const zc = (zB + zF) / 2;
  for (const sgn of [1, -1]) {
    const mid = { z: zc + (sgn * run) / 2, y: RIDGE - rise / 2 + 0.03 };
    b.add(G.box(W1 - W0 + 0.14, 0.06, L), m.slate, M((W0 + W1) / 2, mid.y, mid.z, sgn * a, 0, 0));
  }
  b.add(G.box(W1 - W0 + 0.16, 0.07, 0.07), m.zinc, M((W0 + W1) / 2, RIDGE + 0.03, zc, Math.PI / 4, 0, 0));
  b.box(m.brick, -0.55, 1.6, -0.6, -0.35, 2.3, -0.4);
  b.box(m.trim, -0.57, 2.3, -0.62, -0.33, 2.34, -0.38);
  b.box(m.bluestone, W0 - 0.01, 0, zB - 0.01, W1 + 0.01, 0.08, zF + 0.012);
  // window (front quad) with shutters, door
  const winMat = c.glow(WARM, 1.45, { map: k.windowTex });
  const window = new THREE.Mesh(G.plane(0.38, 0.46), winMat);
  window.position.set(-0.32, 0.86, zF + 0.004);
  c.root.add(window);
  b.at(M(-0.32, 0.86, zF), () => {
    const f = 0.032;
    b.box(m.trim, -0.19 - f, -0.23 - f, 0, -0.19, 0.23 + f, 0.03);
    b.box(m.trim, 0.19, -0.23 - f, 0, 0.19 + f, 0.23 + f, 0.03);
    b.box(m.trim, -0.19, 0.23, 0, 0.19, 0.23 + f, 0.03);
    b.box(m.trim, -0.19, -0.23 - f, 0, 0.19, -0.23, 0.03);
    b.box(m.bluestone, -0.26, -0.3, 0, 0.26, -0.262, 0.07);
    b.box(m.wood, -0.36, -0.25, 0.005, -0.235, 0.25, 0.03);
    b.box(m.wood, 0.235, -0.25, 0.005, 0.36, 0.25, 0.03);
    // flower box
    b.box(m.wood, -0.21, -0.36, 0.02, 0.21, -0.3, 0.11);
    b.add(G.ico(0.05, 1), m.foliage, M(-0.13, -0.28, 0.065));
    b.add(G.ico(0.055, 1), m.foliage, M(0.0, -0.275, 0.065));
    b.add(G.ico(0.05, 1), m.foliage, M(0.13, -0.28, 0.065));
  });
  b.box(m.door, 0.2, 0.08, zF, 0.5, 0.98, zF + 0.025);
  b.box(m.trim, 0.17, 0.08, zF, 0.53, 1.02, zF + 0.012);
  b.add(G.rbox(0.42, 0.07, 0.16, 0.01), m.bluestone, M(0.35, 0.035, zF + 0.09));
  b.add(G.sphere(0.016, 8, 6), m.brass, M(0.45, 0.52, zF + 0.035));
  b.box(m.trim, 0.12, 1.06, zF, 0.58, 1.09, zF + 0.16);
  // garden bench (wood slats, iron frame), round tree, path, hedge
  b.at(M(1.0, 0, 0.5, 0, -0.55, 0), () => {
    for (let i = 0; i < 3; i++) b.add(G.rbox(0.78, 0.022, 0.05, 0.006), m.wood, M(0, 0.29, -0.06 + i * 0.062));
    for (let i = 0; i < 2; i++) b.add(G.rbox(0.78, 0.05, 0.02, 0.006), m.wood, M(0, 0.39 + i * 0.075, -0.115, -0.18, 0, 0));
    for (const x of [-0.36, 0.36]) {
      b.box(m.iron, x - 0.015, 0, -0.1, x + 0.015, 0.29, -0.08);
      b.box(m.iron, x - 0.015, 0, 0.07, x + 0.015, 0.29, 0.09);
      b.box(m.iron, x - 0.015, 0.37, -0.09, x + 0.015, 0.39, 0.08);
      b.box(m.iron, x - 0.015, 0.29, 0.07, x + 0.015, 0.39, 0.09);
      b.add(G.box(0.03, 0.26, 0.02), m.iron, M(x, 0.42, -0.12, -0.18, 0, 0));
    }
  });
  b.add(G.cyl(0.05, 0.075, 0.95, 10), m.bark, M(-1.12, 0.47, -0.3));
  b.add(G.ico(0.46, 2), m.foliage, M(-1.12, 1.35, -0.3, 0, 0, 0, 1, 0.92, 1));
  b.add(G.ico(0.26, 1), m.foliage, M(-0.92, 1.12, -0.06));
  for (let i = 0; i < 5; i++) b.add(G.rbox(0.28, 0.03, 0.15, 0.012), m.paving, M(0.35 + (i % 2) * 0.03, 0.012, 0.3 + i * 0.22));
  hedgeArc(b, m.foliage, 1.43, (100 * Math.PI) / 180, (150 * Math.PI) / 180, 0.18, 0.13);
  const ground = c.ground((g, X, Z, S, rr) => {
    paintLawn(g, S, rr, "#34503d");
    aoRect(g, X, Z, W0 - 0.06, zB - 0.06, W1 + 0.06, zF + 0.03, 14, 0.75);
    aoDisc(g, X, Z, -1.12, -0.3, 0.5, 18, 0.45);
    aoDisc(g, X, Z, 1.0, 0.5, 0.36, 12, 0.4);
  }, 31);
  addPlinth(b, k, ground);
  b.build(c.root);
  return { window, stand: [0.48, 0, 0.92], standRotY: -0.2, padlock: [0.05, 2.42, 0.1] };
}

function sceneBaby(c: Ctx): SceneOut {
  const k = c.kit;
  const m = k.mat;
  const b = new Builder();
  const zF = 0.05;
  const HW = 0.64;
  const EAVE = 1.32;
  const RIDGE = 2.06;
  // brick house, gable to the front
  b.box(m.brick, -HW, 0, -0.95, HW, EAVE, zF);
  const tri = new THREE.Shape([new THREE.Vector2(-HW, EAVE - 0.01), new THREE.Vector2(HW, EAVE - 0.01), new THREE.Vector2(0, RIDGE - 0.02)]);
  b.add(slab(tri, 0.06), m.brick, M(0, 0, zF));
  b.add(slab(tri, 0.06), m.brick, M(0, 0, -0.89));
  const run = HW + 0.08;
  const rise = RIDGE - EAVE + 0.05;
  const L = Math.hypot(run, rise);
  const a = Math.atan2(rise, run);
  for (const sgn of [1, -1]) {
    b.add(G.box(L, 0.06, 1.16), m.slate, M((sgn * run) / 2, RIDGE - rise / 2 + 0.03, -0.45, 0, 0, -sgn * a));
  }
  b.add(G.box(0.07, 0.07, 1.18), m.zinc, M(0, RIDGE + 0.04, -0.45, 0, 0, Math.PI / 4));
  b.box(m.trim, -HW - 0.01, EAVE - 0.02, zF, HW + 0.01, EAVE + 0.02, zF + 0.025);
  b.box(m.bluestone, -HW - 0.01, 0, -0.96, HW + 0.01, 0.08, zF + 0.012);
  b.add(G.circle(0.085, 24), m.glass, M(0, 1.68, zF + 0.004));
  b.add(G.torus(0.085, 0.016, 6, 24), m.trim, M(0, 1.68, zF + 0.01));
  const winMat = c.glow(WARM, 1.45, { map: k.windowTex });
  const window = new THREE.Mesh(G.plane(0.38, 0.46), winMat);
  window.position.set(-0.28, 0.86, zF + 0.004);
  c.root.add(window);
  b.at(M(-0.28, 0.86, zF), () => {
    const f = 0.032;
    b.box(m.trim, -0.19 - f, -0.23 - f, 0, -0.19, 0.23 + f, 0.03);
    b.box(m.trim, 0.19, -0.23 - f, 0, 0.19 + f, 0.23 + f, 0.03);
    b.box(m.trim, -0.19, 0.23, 0, 0.19, 0.23 + f, 0.03);
    b.box(m.trim, -0.19, -0.23 - f, 0, 0.19, -0.23, 0.03);
    b.box(m.bluestone, -0.25, -0.3, 0, 0.25, -0.262, 0.07);
  });
  b.box(m.door, 0.18, 0.08, zF, 0.46, 0.98, zF + 0.025);
  b.box(m.trim, 0.15, 0.08, zF, 0.49, 1.02, zF + 0.012);
  b.add(G.sphere(0.016, 8, 6), m.brass, M(0.41, 0.52, zF + 0.035));
  b.add(G.rbox(0.4, 0.07, 0.16, 0.01), m.bluestone, M(0.32, 0.035, zF + 0.09));
  // little canopy over the door
  b.add(G.box(0.42, 0.03, 0.2), m.slate, M(0.32, 1.1, zF + 0.1, 0.25, 0, 0));
  // pram: bassinet, hood, wheels, handle
  const pram = new THREE.Vector3(1.0, 0, 0.42);
  b.at(M(pram.x, 0, pram.z, 0, -0.5, 0), () => {
    b.add(G.rbox(0.34, 0.16, 0.22, 0.06, 2), m.fabric, M(0, 0.36, 0));
    b.add(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI, 0, Math.PI / 2), m.fabric, M(-0.1, 0.42, 0, 0, Math.PI / 2, 0, 1, 1.05, 1.0));
    b.box(m.trim, -0.17, 0.43, -0.112, 0.17, 0.445, 0.112);
    for (const wx of [-0.12, 0.12]) {
      for (const wz of [-0.12, 0.12]) {
        b.add(G.torus(0.07, 0.014, 6, 18), m.rubber, M(wx, 0.08, wz));
        b.add(G.cyl(0.018, 0.018, 0.02, 8), m.chrome, M(wx, 0.08, wz, Math.PI / 2, 0, 0));
      }
    }
    b.add(G.cyl(0.008, 0.008, 0.28, 6), m.chrome, M(0, 0.08, 0.12, 0, 0, Math.PI / 2));
    b.add(G.cyl(0.008, 0.008, 0.28, 6), m.chrome, M(0, 0.08, -0.12, 0, 0, Math.PI / 2));
    b.add(G.cyl(0.008, 0.008, 0.36, 6), m.chrome, M(0.03, 0.2, 0.11, 0, 0, 0.9));
    b.add(G.cyl(0.008, 0.008, 0.36, 6), m.chrome, M(0.03, 0.2, -0.11, 0, 0, 0.9));
    b.add(G.cyl(0.009, 0.009, 0.32, 6), m.chrome, M(0.24, 0.5, 0.11, 0, 0, 0.45));
    b.add(G.cyl(0.009, 0.009, 0.32, 6), m.chrome, M(0.24, 0.5, -0.11, 0, 0, 0.45));
    b.add(G.cyl(0.016, 0.016, 0.26, 8), m.rubber, M(0.31, 0.64, 0, Math.PI / 2, 0, 0));
  });
  // balloons tied to the handle, each sways on its string
  const tie = new THREE.Vector3(pram.x + 0.31 * Math.cos(0.5), 0.64, pram.z + 0.31 * Math.sin(0.5));
  const balloons: { g: THREE.Group; ph: number }[] = [];
  const balloonMats = [m.balloonA, m.balloonB];
  [[-0.08, 0.72, 0.05], [0.12, 0.62, -0.08]].forEach(([dx, h, dz], i) => {
    const grp = new THREE.Group();
    grp.position.copy(tie);
    const bb = new Builder();
    const top = new THREE.Vector3(dx, h, dz);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx * 0.4, h * 0.45, dz * 0.4 + 0.02), top]);
    bb.add(new THREE.TubeGeometry(curve, 10, 0.003, 3, false), m.trim);
    bb.add(G.sphere(0.12, 18, 14), balloonMats[i], M(top.x, top.y + 0.13, top.z, 0, 0, 0, 1, 1.16, 1));
    bb.add(G.cyl(0.004, 0.018, 0.025, 8), balloonMats[i], M(top.x, top.y + 0.005, top.z));
    bb.build(grp);
    c.root.add(grp);
    balloons.push({ g: grp, ph: i * 1.9 });
  });
  c.anim.push((t) => {
    for (const bl of balloons) {
      bl.g.rotation.z = Math.sin(t * 1.1 + bl.ph) * 0.07;
      bl.g.rotation.x = Math.sin(t * 0.8 + bl.ph * 1.3) * 0.05;
    }
  });
  for (let i = 0; i < 5; i++) b.add(G.rbox(0.26, 0.03, 0.15, 0.012), m.paving, M(0.32, 0.012, 0.3 + i * 0.22));
  hedgeArc(b, m.foliage, 1.43, (95 * Math.PI) / 180, (155 * Math.PI) / 180, 0.18, 0.13);
  const ground = c.ground((g, X, Z, S, rr) => {
    paintLawn(g, S, rr, "#33503e");
    aoRect(g, X, Z, -HW - 0.06, -1.0, HW + 0.06, zF + 0.03, 14, 0.75);
    aoDisc(g, X, Z, pram.x, pram.z, 0.22, 10, 0.5);
  }, 41);
  addPlinth(b, k, ground);
  b.build(c.root);
  return { window, stand: [0.5, 0, 0.95], standRotY: -0.2, padlock: [0, 2.42, 0.1] };
}

function sceneCar(c: Ctx): SceneOut {
  const k = c.kit;
  const m = k.mat;
  const b = new Builder();
  const zF = -0.55;
  // garage wall with flat roof, garage door, the front window above the car, wall-box charger
  b.box(m.brick, -1.1, 0, -1.15, 1.1, 1.5, zF);
  b.box(m.trim, -1.13, 1.5, -1.18, 1.13, 1.56, zF + 0.03);
  b.box(m.bluestone, -1.11, 0, -1.16, 1.11, 0.08, zF + 0.012);
  b.box(m.shop, -0.05, 0.0, zF, 0.95, 1.0, zF + 0.02);
  for (let i = 1; i < 5; i++) b.box(m.iron, -0.05, i * 0.2 - 0.006, zF + 0.02, 0.95, i * 0.2 + 0.006, zF + 0.026);
  b.box(m.trim, -0.08, 0, zF, -0.05, 1.03, zF + 0.03);
  b.box(m.trim, 0.95, 0, zF, 0.98, 1.03, zF + 0.03);
  b.box(m.trim, -0.08, 1.0, zF, 0.98, 1.03, zF + 0.03);
  const winMat = c.glow(WARM, 1.45, { map: k.windowTex });
  const window = new THREE.Mesh(G.plane(0.4, 0.42), winMat);
  window.position.set(-0.6, 1.05, zF + 0.004);
  c.root.add(window);
  b.at(M(-0.6, 1.05, zF), () => {
    const f = 0.032;
    b.box(m.trim, -0.2 - f, -0.21 - f, 0, -0.2, 0.21 + f, 0.03);
    b.box(m.trim, 0.2, -0.21 - f, 0, 0.2 + f, 0.21 + f, 0.03);
    b.box(m.trim, -0.2, 0.21, 0, 0.2, 0.21 + f, 0.03);
    b.box(m.trim, -0.2, -0.21 - f, 0, 0.2, -0.21, 0.03);
    b.box(m.bluestone, -0.26, -0.28, 0, 0.26, -0.242, 0.07);
  });
  // wall box
  const led = c.glow(ACCENT, 1.6);
  b.add(G.rbox(0.17, 0.26, 0.07, 0.03, 2), m.paint, M(-0.27, 0.72, zF + 0.035));
  b.add(G.rbox(0.11, 0.08, 0.01, 0.01), m.glass, M(-0.27, 0.77, zF + 0.071));
  b.add(G.box(0.08, 0.008, 0.004), led, M(-0.27, 0.66, zF + 0.072));
  b.add(G.torus(0.045, 0.01, 6, 14), m.rubber, M(-0.27, 0.48, zF + 0.04, 0, 0, 0));
  // the car: rounded EV body, dark glasshouse, wheels; nose turned towards the camera
  const car = M(-0.12, 0, 0.08, 0, -0.32, 0);
  const lightBar = c.glow("#fff2e0", 1.6);
  b.at(car, () => {
    const side = new THREE.Shape();
    side.moveTo(-0.8, 0.11);
    side.lineTo(0.8, 0.11);
    side.quadraticCurveTo(0.86, 0.12, 0.86, 0.22);
    side.lineTo(0.84, 0.33);
    side.quadraticCurveTo(0.6, 0.39, 0.38, 0.41);
    side.lineTo(-0.7, 0.41);
    side.quadraticCurveTo(-0.84, 0.39, -0.85, 0.3);
    side.lineTo(-0.85, 0.2);
    side.quadraticCurveTo(-0.85, 0.11, -0.8, 0.11);
    const body = new THREE.ExtrudeGeometry(side, { depth: 0.56, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 8 });
    body.translate(0, 0, -0.28);
    b.add(body, m.paint);
    const cabin = new THREE.Shape();
    cabin.moveTo(-0.7, 0.4);
    cabin.lineTo(0.36, 0.4);
    cabin.quadraticCurveTo(0.2, 0.6, 0.02, 0.63);
    cabin.lineTo(-0.5, 0.63);
    cabin.quadraticCurveTo(-0.66, 0.62, -0.72, 0.42);
    const glass = new THREE.ExtrudeGeometry(cabin, { depth: 0.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 8 });
    glass.translate(0, 0, -0.25);
    b.add(glass, m.glass);
    b.add(G.rbox(0.62, 0.025, 0.5, 0.01), m.paint, M(-0.24, 0.655, 0));
    for (const wx of [-0.52, 0.52]) {
      for (const wz of [-0.31, 0.31]) {
        b.add(G.cyl(0.145, 0.145, 0.1, 22), m.rubber, M(wx, 0.145, wz, Math.PI / 2, 0, 0));
        b.add(G.cyl(0.09, 0.09, 0.104, 18), m.chrome, M(wx, 0.145, wz, Math.PI / 2, 0, 0));
      }
    }
    b.add(G.box(0.02, 0.025, 0.5), lightBar, M(0.905, 0.3, 0));
    b.box(m.iron, -0.92, 0.27, -0.25, -0.9, 0.3, 0.25);
    b.box(m.iron, -0.86, 0.12, -0.3, 0.88, 0.16, 0.3);
  });
  // charging cable from the wall box to the car's flap
  const port = new THREE.Vector3(-0.78, 0.36, 0.34).applyMatrix4(car);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.27, 0.6, zF + 0.05),
    new THREE.Vector3(-0.3, 0.2, zF + 0.12),
    new THREE.Vector3(-0.45, 0.03, -0.2),
    new THREE.Vector3(port.x - 0.08, 0.05, port.z + 0.12),
    port,
  ]);
  b.add(new THREE.TubeGeometry(cable, 40, 0.014, 6, false), m.rubber);
  b.add(G.rbox(0.06, 0.05, 0.08, 0.01), m.iron, M(port.x, port.y, port.z));
  const ground = c.ground((g, X, Z, S, rr) => {
    paintLawn(g, S, rr, "#31493b");
    g.fillStyle = "#8b8882";
    g.fillRect(X(-1.3), Z(zF), X(1.3) - X(-1.3), S);
    for (let gz = zF; gz < GROUND_HALF; gz += 0.3) {
      for (let gx = -1.3; gx < 1.3; gx += 0.3) {
        g.fillStyle = tint("#8f8c86", 0.9 + rr() * 0.14);
        g.fillRect(X(gx) + 1.5, Z(gz) + 1.5, X(gx + 0.3) - X(gx) - 3, Z(gz + 0.3) - Z(gz) - 3);
      }
    }
    aoRect(g, X, Z, -1.16, -1.2, 1.16, zF + 0.04, 14, 0.75);
    soft(g, 14, "rgba(6,10,18,0.7)", (h) => {
      h.save();
      h.translate(X(-0.12), Z(0.08));
      h.rotate(0.32);
      h.fillRect(-0.9 * 158, -0.36 * 158, 1.8 * 158, 0.72 * 158);
      h.restore();
    });
  }, 51);
  addPlinth(b, k, ground);
  b.build(c.root);
  return { window, stand: [0.98, 0, 0.7], standRotY: -0.3, padlock: [0, 2.12, -0.2] };
}

const SCENES: Record<DioramaId, (c: Ctx) => SceneOut> = {
  house: sceneHouse,
  business: sceneBusiness,
  retire: sceneRetire,
  baby: sceneBaby,
  car: sceneCar,
};

// ───────────────────────────── public entry ─────────────────────────────

export function buildDiorama(id: DioramaId, kitIn: PickerKit): Diorama {
  const ownKit = isKit(kitIn) ? null : (pickerKit({ fontFamily: kitIn.fontFamily }) as Kit);
  const kit = ownKit ?? (kitIn as Kit);
  const c = new Ctx(kit);
  const root = c.root;
  root.name = `diorama-${id}`;
  const out = SCENES[id](c);

  const stand = new THREE.Object3D();
  stand.name = "stand";
  stand.position.set(...out.stand);
  stand.rotation.y = out.standRotY;
  root.add(stand);

  const shadow = new THREE.Mesh(kit.shadow.geo, kit.shadow.mat);
  shadow.position.y = PLINTH_BOTTOM - 0.004;
  shadow.renderOrder = -1;
  shadow.userData.noLock = true;
  root.add(shadow);

  const ringMat = c.own(new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false, transparent: true, depthWrite: false, opacity: 1 }));
  const ring = new THREE.Mesh(kit.ringGeo, ringMat);
  ring.name = "selection-ring";
  ring.position.y = RING_Y;
  ring.userData.noLock = true;
  root.add(ring);

  const padlock = new THREE.Group();
  padlock.name = "padlock";
  const padMesh = new THREE.Mesh(kit.padlock.geo, kit.padlock.mat);
  padMesh.userData.noLock = true;
  padlock.add(padMesh);
  padlock.position.set(...out.padlock);
  padlock.scale.setScalar(0.8);
  padlock.visible = false;
  root.add(padlock);

  // Geometry this diorama owns (the stand's future children, e.g. the character, are not ours to free).
  const ownMeshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== shadow && o !== ring && o.parent !== padlock) ownMeshes.push(o);
  });

  let locked = false;
  let focus = 1;
  const originals = new Map<THREE.Mesh, THREE.Material>();
  const applyGlow = () => {
    const s = glowScale(focus);
    for (const g of c.glows) g.mat.color.copy(g.base).multiplyScalar(g.gain * s);
    const o = locked ? 0 : ringOpacity(focus);
    ringMat.opacity = o;
    ring.visible = o > 0.01;
  };
  applyGlow();

  return {
    id,
    root,
    window: out.window,
    stand,
    setLocked(l: boolean) {
      locked = l;
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.userData.hideWhenLocked) o.visible = !l;
        if (o.userData.noLock || o.parent === padlock) return;
        let orig = originals.get(o);
        if (!orig) {
          orig = o.material as THREE.Material;
          originals.set(o, orig);
        }
        if (orig.userData.lockAs === "hide") o.visible = !l;
        else o.material = l ? c.twin(orig) : orig;
      });
      padlock.visible = l;
      applyGlow();
    },
    setFocus(f: number) {
      if (f === focus) return;
      focus = f;
      applyGlow();
    },
    update(t: number, dt: number) {
      if (!locked) for (const a of c.anim) a(t, dt);
      if (padlock.visible) {
        padlock.position.y = out.padlock[1] + Math.sin(t * 1.3) * 0.03;
        padlock.rotation.y = Math.sin(t * 0.6) * 0.3;
        padlock.rotation.z = Math.sin(t * 0.9 + 1) * 0.04;
      }
    },
    dispose() {
      for (const mesh of ownMeshes) mesh.geometry.dispose();
      root.removeFromParent();
      c.dispose();
      ownKit?.dispose();
    },
  };
}
