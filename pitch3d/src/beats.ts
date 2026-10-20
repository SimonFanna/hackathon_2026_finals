// Pure beat state machine + presenter input mapping.

export const BEAT_COUNT = 7;
export type Action = "next" | "prev" | "restart" | "quality";

export const clampBeat = (n: number) => Math.min(BEAT_COUNT - 1, Math.max(0, Math.trunc(n)));

export function step(beat: number, action: "next" | "prev" | "restart"): number {
  if (action === "restart") return 0;
  return clampBeat(beat + (action === "next" ? 1 : -1));
}

/** Arrow keys, Enter/Space, and presenter clickers (PageDown/PageUp). */
export function actionForKey(key: string): Action | null {
  switch (key) {
    case "ArrowRight": case "PageDown": case " ": case "Enter": return "next";
    case "ArrowLeft": case "PageUp": case "Backspace": return "prev";
    case "r": case "R": return "restart";
    case "q": case "Q": return "quality";
    default: return null;
  }
}

export function parseParams(search: string): { beat: number; quality: "low" | null } {
  const p = new URLSearchParams(search);
  const n = Number(p.get("beat"));
  return { beat: Number.isFinite(n) ? clampBeat(n) : 0, quality: p.get("q") === "low" ? "low" : null };
}
