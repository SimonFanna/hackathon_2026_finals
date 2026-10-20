// Entry transition, second half: the window light becomes the phone screen.
// Lives on document.body (outside React) so it survives the picker unmounting while Stage mounts.
// 1) cover(): a full-screen warm light the dive ends in.  2) land(): once Stage has mounted, morph
// that light into the measured phone screen ([data-phone-anchor]), fade the backdrop so the phone
// frame appears around it, then fade the light to reveal the home screen.

const WARM = "#ffe2bd";
const SCREEN = "#f2f2f2"; // KDL surface background = the phone screen colour
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// Phone.tsx: 10px bezel and 50px inner radius at scale 1, frame FRAME_W × FRAME_H.
const BEZEL = 10;
const RADIUS = 50;
const FRAME_W = 410;

export interface Handoff {
  /** Fade the warm light in over `ms` (end of the dive). */
  cover(ms: number): Promise<void>;
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
  Object.assign(card.style, { position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", background: WARM, opacity: "0", borderRadius: "0px" });
  root.append(backdrop, card);
  document.body.appendChild(root);

  const remove = () => root.remove();

  return {
    async cover(ms) {
      if (reduce) {
        // Crossfade only: the night backdrop, no light.
        await backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" }).finished;
        return;
      }
      // The light fades in over the 3D scene itself; the backdrop only goes up once the light is opaque.
      await card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: "ease-in", fill: "forwards" }).finished;
      backdrop.style.opacity = "1";
    },

    async land() {
      const anchor = await waitFor(() => document.querySelector<HTMLElement>("[data-phone-anchor]"), 1200);
      if (reduce || !anchor) {
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
          { left: "0px", top: "0px", width: `${innerWidth}px`, height: `${innerHeight}px`, borderRadius: "0px", background: WARM, opacity: 1 },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.radius}px`, background: SCREEN, opacity: 1 },
        ],
        { duration: 480, easing: EASE, fill: "forwards" },
      );
      const reveal = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 120, easing: "ease-out", fill: "forwards" });
      await Promise.all([morph.finished, reveal.finished]);
      await card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" }).finished;
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
