import type * as THREE from "three";

// Contract between the carousel (PickerCanvas.tsx) and the 3D people standing in each diorama.
// Implemented procedurally in characters.ts (a CC0 GLB implementation can follow the same shape).

export type CharacterId = "thomas" | "lina" | "retiree" | "parent" | "driver";
export type Pose = "idle" | "wave" | "cheer";

export interface Character {
  id: CharacterId;
  /** Feet at y = 0, facing +z, about 1.1 units tall (a diorama door is about 0.9). */
  root: THREE.Group;
  /** idle: breathing + small weight shifts · wave: when centred, greets the camera · cheer: on Play, before the dive. */
  setPose(pose: Pose): void;
  /** Dimmed silhouette for the locked goals: no face, flat dark-blue material. */
  setLocked(locked: boolean): void;
  /** 0 = side of the carousel (dim), 1 = centred (fully lit). */
  setFocus(focus: number): void;
  /** Animation tick. t, dt in seconds. Cheap: no allocation per frame. */
  update(t: number, dt: number): void;
  dispose(): void;
}
