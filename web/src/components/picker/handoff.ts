// Entry transition, second half: the window light becomes the phone screen.
// Lives on document.body (outside React) so it survives the picker unmounting while Stage mounts.
// 1) cover(): the dive ends close to the lit window; a warm card lights up exactly on the window's
//    on-screen rectangle while the night backdrop hides the rest of the scene (no full-screen flash).
// 2) land(): once Stage has mounted, morph that card into the measured phone screen ([data-phone-anchor])
//    while the backdrop fades to reveal the phone frame, and fade the card out as it lands.

export interface ScreenRect { left: number; top: number; width: number; height: number }

const WARM = "#ffe2bd";
const SCREEN = "#f2f2f2"; // KDL surface background = the phone screen colour
const GLOW = "0 0 56px 6px rgb(255 207 150 / 0.35)";
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)"; // a glide, not a snap: the light travels ~200 px
// Phone.tsx: 10px bezel and 50px inner radius at scale 1, frame FRAME_W × FRAME_H.
const BEZEL = 10;
const RADIUS = 50;
const FRAME_W = 410;

export interface Handoff {
  /** End of the dive: light the window (`rect`, viewport px) and hide the scene. Without a rect: crossfade only. */
  cover(ms: number, rect?: ScreenRect): Promise<void>;
  /** Morph into the phone once Stage has mounted, then remove the overlay. */
  land(): Promise<void>;
  remove(): void;
}

export function createHandoff(reduce: boolean): Handoff {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "60", pointerEvents: "none" });
  const backdrop = document.createElement("div");
  Object.assign(backdrop.style, { position: "absolute", inset: "0", background: "linear-gradient(180deg,#021e43 0%,#0d2a50 100%)", opacity: "0" });
  const card = document.createElement("div");
  Object.assign(card.style, { position: "absolute", background: WARM, opacity: "0", borderRadius: "3px", boxShadow: GLOW });
  root.append(backdrop, card);
  document.body.appendChild(root);

  let from: ScreenRect | null = null; // where the light is, once covered
  const remove = () => root.remove();

  return {
    async cover(ms, rect) {
      if (reduce || !rect) {
        // Crossfade only: the night backdrop, no light.
        await backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" }).finished;
        return;
      }
      from = rect;
      Object.assign(card.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      await Promise.all([
        card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: "ease-out", fill: "forwards" }).finished,
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, easing: "ease-out", fill: "forwards" }).finished,
      ]);
      // Stage mounts now (250–300 ms): a slow breath so the light never looks frozen.
      card.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.12)" }, { filter: "brightness(1)" }], { duration: 600, iterations: Infinity, easing: "ease-in-out" });
    },

    async land() {
      const anchor = await waitFor(() => document.querySelector<HTMLElement>("[data-phone-anchor]"), 1200);
      if (reduce || !anchor || !from) {
        await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-out", fill: "forwards" }).finished;
        remove();
        return;
      }
      // Wait one frame so Stage's layout (phone + HUD) has settled before measuring.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const r = anchor.getBoundingClientRect();
      const s = r.width / FRAME_W;
      const to = { left: r.left + BEZEL * s, top: r.top + BEZEL * s, width: r.width - 2 * BEZEL * s, height: r.height - 2 * BEZEL * s, radius: RADIUS * s };
      const morph = card.animate(
        [
          { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "3px", background: WARM, boxShadow: GLOW },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.radius}px`, background: SCREEN, boxShadow: "0 0 0 0 rgb(255 207 150 / 0)" },
        ],
        { duration: 600, easing: EASE, fill: "forwards" },
      );
      const reveal = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 440, delay: 160, easing: "ease-out", fill: "forwards" });
      // The home screen shows through as the light lands, not after it.
      const fade = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 380, easing: "ease-out", fill: "forwards" });
      await Promise.all([morph.finished, reveal.finished, fade.finished]);
      remove();
    },

    remove,
  };
}

async function waitFor<T>(get: () => T | null, timeoutMs: number): Promise<T | null> {
  const t0 = performance.now();
  for (;;) {
    const v = get();
    if (v) return v;
    if (performance.now() - t0 > timeoutMs) return null;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}
