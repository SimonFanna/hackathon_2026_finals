import type * as THREE from "three";

// Contract between the carousel (PickerCanvas.tsx) and the procedural dioramas (dioramas.ts).
// Units: 1 = about 1 m at miniature scale. Each diorama sits on its own round plinth.

export type DioramaId = "house" | "business" | "retire" | "baby" | "car";

export interface Diorama {
  id: DioramaId;
  /**
   * Centred on its plinth: plinth top at y = 0, footprint radius <= 1.7, total height <= 2.8.
   * The front (the side with the lit window) faces +z in the root's local space.
   */
  root: THREE.Group;
  /**
   * The lit window the camera dives into on play. A front-facing quad (normal +z in root space),
   * centre around y = 0.8–1.2, about 0.3–0.45 wide. Its world position/size drive the dive.
   */
  window: THREE.Mesh;
  /** Desaturate every material, switch emissives off, show a padlock above the scene. */
  setLocked(locked: boolean): void;
  /** 0 = dim (side of the carousel), 1 = fully lit (centred). Drives emissive strength only. */
  setFocus(focus: number): void;
  /** Small idle life (steam, a sign swinging, a flicker). Must be cheap. t, dt in seconds. */
  update(t: number, dt: number): void;
  dispose(): void;
}

export interface PickerKit {
  /** Font family the canvas sign textures should use (read from the page so it matches Nunito Sans). */
  fontFamily: string;
  dispose(): void;
}
