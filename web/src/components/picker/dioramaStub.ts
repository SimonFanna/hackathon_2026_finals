import * as THREE from "three";
import type { Diorama, DioramaId, PickerKit } from "./dioramaTypes";

// TEMPORARY placeholder with the same contract as dioramas.ts, used until the real scenes land.

const COLORS: Record<DioramaId, string> = { house: "#9c5a43", business: "#e9e4da", retire: "#6b7a8f", baby: "#6b7a8f", car: "#6b7a8f" };

export function pickerKit(opts?: { fontFamily?: string }): PickerKit {
  return { fontFamily: opts?.fontFamily ?? '"Nunito Sans", system-ui, sans-serif', dispose() {} };
}

export function buildDiorama(id: DioramaId, kit: PickerKit): Diorama {
  void kit;
  const root = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.3, 48), new THREE.MeshStandardMaterial({ color: "#1b3358", roughness: 0.8 }));
  plinth.position.y = -0.15;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.1), new THREE.MeshStandardMaterial({ color: COLORS[id], roughness: 0.8 }));
  body.position.y = 0.75;
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc98a").multiplyScalar(2), toneMapped: false });
  const window = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34), winMat);
  window.position.set(0, 1.0, 0.56);
  const stand = new THREE.Object3D();
  stand.position.set(0.95, 0, 0.75);
  root.add(plinth, body, window, stand);
  let focus = 1;
  let locked = false;
  const apply = () => winMat.color.set("#ffc98a").multiplyScalar(locked ? 0 : 0.4 + 1.8 * focus);
  return {
    id, root, window, stand,
    setLocked(l) { locked = l; (body.material as THREE.MeshStandardMaterial).color.set(l ? "#5d6b7d" : COLORS[id]); apply(); },
    setFocus(f) { focus = f; apply(); },
    update() {},
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); },
  };
}
