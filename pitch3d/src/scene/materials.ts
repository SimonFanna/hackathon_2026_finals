import * as THREE from "three";

// KDL palette (docs/features/ux-redesign.md). Accent and Kate colours are reserved roles.
export const C = {
  night: new THREE.Color("#0d2a50"),
  nightDeep: new THREE.Color("#021e43"),
  accent: new THREE.Color("#0097db"),
  kate: new THREE.Color("#55c7df"),
  warm: new THREE.Color("#ffc98a"),
  cool: new THREE.Color("#cfe6ff"),
};

/** Shared material roles: one instance per role, reused everywhere. */
export function materialKit() {
  return {
    ground: new THREE.MeshStandardMaterial({ color: "#0c1f3b", roughness: 0.95, metalness: 0 }),
    plinthSide: new THREE.MeshStandardMaterial({ color: "#081933", roughness: 0.8 }),
    street: new THREE.MeshStandardMaterial({ color: "#071630", roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: "#2a4670", roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: "#2c3c58", roughness: 0.62, metalness: 0.15 }),
    landmark: new THREE.MeshStandardMaterial({ color: "#24426b", roughness: 0.6, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: "#132541", roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: "#3a5b85", roughness: 0.5, metalness: 0.4 }),
    tree: new THREE.MeshStandardMaterial({ color: "#123a35", roughness: 1 }),
    // Unlit emissive signals (bloom picks them up in high quality).
    window: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    accentGlow: new THREE.MeshBasicMaterial({ color: C.accent.clone().multiplyScalar(2.2), toneMapped: false }),
    kateGlow: new THREE.MeshBasicMaterial({ color: C.kate.clone().multiplyScalar(2), toneMapped: false, transparent: true, side: THREE.DoubleSide }),
    warmGlow: new THREE.MeshBasicMaterial({ color: C.warm.clone().multiplyScalar(2.4), toneMapped: false }),
  };
}
export type MaterialKit = ReturnType<typeof materialKit>;

/** Soft round sprite for point lights, drawn on a canvas (no image asset). */
export function glowSprite(size = 64): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
