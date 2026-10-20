# Feature — 3D persona carousel at app start
> Owner: peer session "README hackathon 2026" (ultracode) · Coordinator: kepa · App owner: Victor · Status: todo · Last update: 12:00

## Goal
Replace the 2D "Choose your player" cards (`CharacterSelect.tsx`, Victor, see `outcome-engine.md`) with a **3D carousel of miniature life scenes**, then an **entry animation into the phone**, then the existing live demo, unchanged. It makes the app feel premium from the first second (Creativity + Pitch = 50%).

Replaces the paused "Lucas's World" (`pitch-3d.md`). Reuse its learnings: the Iris Xe fps numbers, cheap materials, and the low-quality path.

## What we see
1. **Carousel (screen `select`).** KBC night-blue stage. One miniature diorama per player on a slow turntable; the centred one is larger and lit, the others recede and dim. Under it, from the persona registry (`@/engine` `personas`): name, age, city, goal, the stats Victor already derives (budget limit…), and the 4 event badges.
   - **Thomas · first home:** a small Flemish house, moving boxes, a "for sale" sign, warm window.
   - **Lina · first business:** a coffee-bar storefront with an awning, an espresso machine glow, a "coming soon" sign.
   - **3 locked goals** (Victor's `locked` list: new baby, car, pension): the same scene style, desaturated, with a lock, captioned "Same engine, new data". They can't be played.
2. **Entry animation (~1.5 s) on play.** The camera dives into the lit window of the chosen scene. The window grows into the phone screen, the existing `Phone` frame fades in over it, and we land on that player's home screen. Kate's notification then arrives as today.
3. **Live demo:** Victor's flow, untouched.

## Contract (keep Victor's code intact)
- New component `web/src/components/picker/CharacterSelect3D.tsx` with **the same props** as `CharacterSelect`: `{ selected, onSelect, onPlay, compact }`. `Stage` keeps owning the keys (← → / 1 2 / Enter, C = back to players).
- `Stage.tsx`: the only change is to render `CharacterSelect3D` instead of `CharacterSelect` for `screen === "select"`, plus a hook for the entry transition (prefer an `onPlay` that resolves after the dive). Keep the diff in Victor's files to a few lines, and tell him.
- Loaded with `next/dynamic` (`ssr: false`), so three.js never runs on the server, and it is code-split from the demo.
- **Fallback = Victor's 2D `CharacterSelect`**, unchanged, when: no WebGL, `compact` (small viewport), `?q=low`, or fps < 30 for 2 s. The demo must never depend on the 3D.
- `?player=…` deep links still skip the carousel.

## Constraints
- three.js via `@react-three/fiber` + `@react-three/drei` **or** vanilla three in a `useEffect` (implementer's choice; vanilla matches pitch3d). Pinned versions + lockfile. Procedural geometry only; no CDN, no downloaded models; everything works offline.
- Perf: Iris Xe, 1080p ≥ 50 fps in high. Lessons from pitch3d: static shadow map or none, no point lights, Lambert/Standard with low roughness variety, half-res bloom or none. `prefers-reduced-motion` → no turntable, crossfade instead of the dive.
- CSP (`web/next.config.ts`): WebGL needs nothing new. If a worker or wasm is added, update the CSP and verify there are no violations.
- KBC tokens (`ux-redesign.md`), English copy, accessible: the carousel items are buttons with labels; focus is visible.
- Don't touch the engine, backend, or Victor's screens beyond the `Stage` swap.

## Definition of done
- [ ] Carousel + entry animation work with keyboard, mouse/drag, and touch.
- [ ] Fallback to the 2D picker is verified (WebGL off, `?q=low`, small viewport).
- [ ] Full flow verified in a browser on a prod build: pick Thomas → full demo; C → back; pick Lina → full demo. No console or CSP errors.
- [ ] fps measured on the GPU (`--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist`), high + fallback.
- [ ] `npm run lint`, `npm test`, `npm run build` green in `web/`.
- [ ] Screenshots in `docs/screenshots/picker-3d/`; this doc + `SOLUTION.md` updated; Victor informed.

## Decisions (and why)
- **Victor's players, not the 6 Supabase personas** (user, 12:00): they already have full journeys and disruptions; the least risk before 16:00.
- **Same props as `CharacterSelect`:** a drop-in, so Victor's state machine and keys keep working and the 2D picker stays as the fallback.

## Known limits / improvement ideas
- **Not Supabase-backed:** Thomas and Lina are static (Thomas reuses the old €320k / "4 searches" signals; Lina isn't in Supabase), against the "Supabase is the only source of truth" rule. To align later: map Thomas → Supabase Sofie (house), Lina → Lucas (business), or add them to Simon's seed.
