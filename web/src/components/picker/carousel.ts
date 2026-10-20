import type { DioramaId } from "./dioramaTypes";

// Pure carousel maths. Cover-flow layout (no wrap): the two players sit in the middle,
// the locked goals recede on both sides. `focus` is a continuous index (1 = Thomas centred).

export const ORDER: DioramaId[] = ["retire", "house", "business", "baby", "car"];
export const PLAYABLE = ["house", "business"] as const;
export type PlayableId = (typeof PLAYABLE)[number];

const SPACING = 3.25; // x distance of the first neighbour
const DEPTH = 2.4; // how far each step recedes
const TURN = 0.42; // radians a side item turns towards the centre

export const indexOfId = (id: DioramaId) => ORDER.indexOf(id);

export interface Slot { x: number; z: number; rotY: number; scale: number; light: number }

export function layout(i: number, focus: number): Slot {
  const o = i - focus;
  const a = Math.abs(o);
  const s = Math.sign(o);
  const reach = a <= 1 ? a : 1 + (a - 1) * 0.55; // later neighbours bunch up behind the first one
  return {
    x: s * reach * SPACING,
    z: -Math.min(a, 2.5) * DEPTH,
    rotY: -s * Math.min(a, 1) * TURN,
    scale: 1 - 0.22 * Math.min(a, 1.6),
    light: Math.max(0.18, 1 - 0.75 * Math.min(a, 1.2)),
  };
}

export function nearestPlayable(focus: number): PlayableId {
  let best: PlayableId = PLAYABLE[0];
  let dist = Infinity;
  for (const id of PLAYABLE) {
    const d = Math.abs(indexOfId(id) - focus);
    if (d < dist) {
      dist = d;
      best = id;
    }
  }
  return best;
}

/** Drag in pixels → new continuous focus. A full-width drag moves about 2.5 items. */
export function dragFocus(start: number, dx: number, width: number): number {
  const f = start - (dx / Math.max(width, 1)) * 2.5;
  return Math.min(ORDER.length - 1 + 0.4, Math.max(-0.4, f));
}
