import * as THREE from "three";
import type { Levels } from "./scene/effects";

// Beat → target state. Applying a beat is idempotent: back, restart and ?beat=N all land on the
// same picture. Under prefers-reduced-motion every move becomes a cut.

export type LevelKey = keyof Levels | "diorama";
export type AllLevels = Levels & { diorama: number };

interface Shot { pos: [number, number, number]; look: [number, number, number]; dur: number }
interface Target { value: number; dur: number; delay?: number }

const SHOTS: Shot[][] = [
  [{ pos: [17, 13.5, 21], look: [1.2, 0.4, 0.6], dur: 2.4 }],
  [{ pos: [13, 12.5, 19], look: [-1.0, 2.2, -1.2], dur: 2.2 }],
  [{ pos: [9.6, 6.4, 11.4], look: [2.0, 2.4, 1.2], dur: 2.0 }],
  [{ pos: [11.5, 7.6, 12.6], look: [2.8, 0.8, 1.0], dur: 2.0 }],
  [{ pos: [17, 17, 21], look: [0.4, 1.0, 0.4], dur: 2.4 }],
  [{ pos: [4, 34, 33], look: [0, 0, 0.5], dur: 2.8 }],
  [
    { pos: [-4, 95, 70], look: [-6, 0, 8], dur: 3.2 },
    { pos: [8, 455, 175], look: [8, 0, 44], dur: 4.2 },
  ],
];

function targets(beat: number): Record<LevelKey, Target> {
  const b = beat;
  return {
    lucas: { value: 1, dur: 1.6 },
    signals: { value: b === 1 ? 1 : 0, dur: b === 1 ? 1.2 : 0.6, delay: b === 1 ? 0.8 : 0 },
    kate: { value: b === 2 ? 1 : 0, dur: b === 2 ? 2.2 : 0.5, delay: b === 2 ? 1.0 : 0 },
    build: { value: b >= 3 ? 6 : 0, dur: b === 3 ? 7.5 : 0.6, delay: b === 3 ? 1.2 : 0 },
    consent: { value: b >= 4 && b <= 5 ? 1 : b === 6 ? 1 : 0, dur: b === 4 ? 1.8 : 0.5, delay: b === 4 ? 1.6 : 0 },
    districts: { value: b >= 5 ? 3 : 0, dur: b === 5 ? 4.8 : 0.5, delay: b === 5 ? 1.2 : 0 },
    map: { value: b === 6 ? 1 : 0, dur: 2.2, delay: b === 6 ? 0.6 : 0 },
    realLights: { value: b === 6 ? 1 : 0, dur: 2.0, delay: b === 6 ? 1.4 : 0 },
    field: { value: b === 6 ? 1 : 0, dur: 3.2, delay: b === 6 ? 4.2 : 0 },
    diorama: { value: b === 6 ? 0 : 1, dur: b === 6 ? 3.0 : 1.2, delay: 0 },
  };
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class Director {
  beat = 0;
  readonly levels: AllLevels = { lucas: 0, signals: 0, kate: 0, build: 0, consent: 0, districts: 0, map: 0, realLights: 0, field: 0, diorama: 1 };
  private tweens = new Map<LevelKey, { from: number; to: number; start: number; dur: number }>();
  private camPath: { from: Shot; to: Shot; start: number }[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  /** Time (s) the current beat started; overlay uses it to sequence text. */
  beatStart = 0;

  constructor(private camera: THREE.PerspectiveCamera, private reducedMotion: boolean) {
    const s = SHOTS[0][0];
    this.camPos.set(...s.pos);
    this.camLook.set(...s.look);
  }

  go(beat: number, now: number, instant = false) {
    const forward = beat > this.beat;
    this.beat = beat;
    this.beatStart = now;
    const cut = instant || this.reducedMotion;
    const tg = targets(beat);
    for (const key of Object.keys(tg) as LevelKey[]) {
      const t = tg[key];
      if (cut) {
        this.levels[key] = t.value;
        this.tweens.delete(key);
        continue;
      }
      const dur = forward ? t.dur : Math.min(t.dur, 0.9);
      const delay = forward ? (t.delay ?? 0) : 0;
      this.tweens.set(key, { from: this.levels[key], to: t.value, start: now + delay, dur });
    }
    const shots = SHOTS[beat];
    if (cut) {
      const last = shots[shots.length - 1];
      this.camPos.set(...last.pos);
      this.camLook.set(...last.look);
      this.camPath = [];
    } else {
      let start = now;
      let from: Shot = { pos: this.camPos.toArray() as [number, number, number], look: this.camLook.toArray() as [number, number, number], dur: 0 };
      this.camPath = (forward ? shots : [shots[shots.length - 1]]).map((to) => {
        const seg = { from, to: forward ? to : { ...to, dur: 1.6 }, start };
        start += seg.to.dur;
        from = to;
        return seg;
      });
    }
    this.applyCamera();
  }

  update(now: number) {
    for (const [key, tw] of this.tweens) {
      const k = THREE.MathUtils.clamp((now - tw.start) / tw.dur, 0, 1);
      if (now < tw.start) continue;
      const smooth = key === "build" || key === "districts" ? k : ease(k);
      this.levels[key] = tw.from + (tw.to - tw.from) * smooth;
      if (k >= 1) this.tweens.delete(key);
    }
    const seg = this.camPath.find((s) => now < s.start + s.to.dur) ?? this.camPath[this.camPath.length - 1];
    if (seg) {
      const k = ease(THREE.MathUtils.clamp((now - seg.start) / seg.to.dur, 0, 1));
      this.camPos.set(...seg.from.pos).lerp(new THREE.Vector3(...seg.to.pos), k);
      this.camLook.set(...seg.from.look).lerp(new THREE.Vector3(...seg.to.look), k);
      if (now > seg.start + seg.to.dur && seg === this.camPath[this.camPath.length - 1]) this.camPath = [];
    }
    this.applyCamera();
  }

  private applyCamera() {
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}
