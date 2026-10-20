# Feature — 3D persona carousel at app start
> Owner: peer session "README hackathon 2026" (ultracode) · Coordinator: kepa · App owner: Victor · Status: in progress (V1 integrated, polishing) · Last update: 12:45

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

## Implementation plan (12:10)

**Files (all new, in `web/src/components/picker/`, except the Stage swap):**
| File | Owner | Role |
|---|---|---|
| `CharacterSelect3D.tsx` | UI terminal | Drop-in with Victor's props (+ optional `playRef`). No three.js import. Renders the page's DOM layer immediately (title, player card from `personas`, buttons, hints), mounts the canvas via `next/dynamic({ ssr: false })`, and falls back to Victor's `CharacterSelect` (unchanged) when needed. |
| `PickerCanvas.tsx` | UI terminal | The three.js scene (vanilla, like pitch3d): renderer, camera, lights, carousel ring of 5 dioramas, drag/touch/click, fps governor (→ fallback), the dive animation (returns a promise). |
| `dioramas.ts` | dioramas agent | Procedural scenes behind the contract in `dioramaTypes.ts`: house (Thomas), coffee bar (Lina), 3 locked (retire, baby, car), padlock, focus/locked states. |
| `carousel.ts` (+ test) | UI terminal | Pure math: ring layout, angles, drag → nearest playable, which item is centred. |
| `capability.ts` (+ test) | UI terminal | Pure: should we use 3D? (`compact`, `?q=low`, deep links, WebGL support). |
| `handoff.ts` | UI terminal | Body-level overlay that turns the window light into the phone screen: after Stage mounts, it measures `[data-phone-anchor]` and morphs into it, then fades to reveal the home screen. |

**Stage diff (Victor's file, ~5 lines):** import swap; render `CharacterSelect3D`; `const pickerPlay = useRef(...)` so Enter on the select screen runs the dive first (`(pickerPlay.current ?? play)(picked)`); `data-phone-anchor` on the phone wrapper.

**Fallback triggers:** `compact` · `?q=low` · no WebGL · WebGL context lost · fps < 30 for 2 s (governor) · the canvas chunk fails to load. In every case Victor's 2D picker renders with the same props.

**Perf budget:** ≤ 120 draw calls, ≤ 150k triangles, no point/spot lights, no shadow maps (contact-shadow textures instead), shared materials, half-resolution bloom in high only, DPR ≤ 1.5. Target ≥ 50 fps on the Iris Xe at 1080p.

**Milestones:** plan ready → first render → integrated + verified (prod build, GPU Playwright, full flow Thomas → C → Lina, no console/CSP errors) → merged into `main` from a separate worktree.

## How it works (built)

**Flow:** `Stage` (screen `select`) → `CharacterSelect3D` → (3D) `PickerCanvas` + DOM layer, or (fallback) Victor's `CharacterSelect`.

**Play, step by step:**
1. **Trigger.** Enter (Stage calls `pickerPlay.current`), a click on the centred diorama, or the "Play as …" button.
2. **Overlay.** `createHandoff()` puts a fixed overlay on `document.body`.
3. **Dive.** `PickerCanvas` settles the turntable to face the camera, then flies the camera into the lit window (ease-in, FOV 30 → 26, about 0.9 s). At 68% of the flight it calls `cover()`: the warm light fades in over the 3D scene.
4. **Mount.** `onPlay(id)` lets Stage switch to `home`; the picker unmounts and disposes its WebGL context.
5. **Land.** `land()` waits for `[data-phone-anchor]`, measures it, then:
   - morphs the light (WAAPI) into the phone screen: inset by the 10 px bezel × scale, 50 px radius × scale, warm → `#F2F2F2`;
   - fades the night backdrop so the phone frame and the HUD appear around it;
   - fades the light out to reveal the home screen. Kate's notification follows as before.
6. **Reduced motion.** A 200 ms crossfade instead of the dive.

**Carousel:**
- Cover-flow order: retire · **Thomas** · **Lina** · baby · car.
- Critically damped spring on a continuous `focus` index. A drag maps pixels to focus; release snaps to the nearest playable item. A tap is a raycast: a side item selects, the centred item plays, a locked item wiggles.
- Each diorama sways gently on its turntable; off under reduced motion.
- DOM over the canvas:
  - one focusable `role=radio` button per diorama, with `aria-label` (pointer-events off, so drags reach the canvas);
  - lock captions under the locked goals;
  - the player card (name, goal, stats, the 4 event badges from `EventBadge`, Play).

**People:**
- Two CC0 rigged and animated models by Quaternius ("Casual Character" → Thomas, "Animated Woman" → Lina; also the locked silhouettes). They were downloaded with the user's approval in the UI session, then inspected: pure glTF 2.0, no external URIs, no required extensions, no textures.
- Stored in `web/public/picker/` (1.43 + 1.49 MB); credits and SHA-256 in `web/public/picker/CREDITS.md`.
- `characterGltf.ts`:
  - loads each file once (same origin, works offline, no decoder, CSP unchanged) and clones per character with `SkeletonUtils`;
  - recolours with the tokens (Thomas top `#0097DB`, Lina dress `#00903D`, skin/hair as in Victor's avatars) and normalises to 1.1 units on the diorama's `stand`;
  - poses: `AnimationMixer` Idle; Wave when centred (every ~7.5 s); Wave × 1.5 + a hop on Play, before the dive. Locked goals are night-blue silhouettes.

**Scenes (`dioramas.ts`, procedural):**
- Thomas: a stepped-gable Flemish brick house, slate roof, white frames, a lit window with a lamp (the dive target), FOR SALE sign, 4 moving boxes, hedges, a path.
- Lina: "LINA'S COFFEE" in navy with a striped awning, an espresso machine glowing behind the window, a COMING SOON A-frame, bistro tables with a steaming cup.
- Locked: a cottage + bench (retire), a house + stroller + balloons (baby), an electric car + wall box (car), each with a padlock.
- Canvas textures only.

**Render:**
- `WebGLRenderer` (DPR ≤ 1.5), ACES, hemisphere + key + rim lights. No point lights, no shadow maps.
- **Default: native MSAA, no post-processing, plus additive window halos** (one sprite per lit window). Bloom (half resolution, MSAA half-float target) is opt-in with `?bloom=1` for strong GPUs.
- Governor: only sustained drops count; it ignores start-up, asset uploads and resizes. Under 45 fps for 2 s it drops bloom (if it was on). Under 30 fps for 2.5 s it switches to the 2D picker. A lost WebGL context also falls back.
- Debug: `window.__picker = { fps, calls, triangles, bloom }`.

## Measured performance (12:40, Intel Iris Xe, Chrome + Vulkan)
| Setting | fps (steady) | Draw calls | Triangles |
|---|---|---|---|
| 1920×1080, default (MSAA + halos) | **60** | 133 | 51k |
| 1920×1080, `?bloom=1` (bloom + MSAA) | 31–41, so the governor drops bloom → 56–58 | 145 | 51k |
| 1600×900, bloom (earlier build) | 53 | 145 | 51k |
| Fallback (Victor's 2D picker) | n/a (DOM only) | 0 | 0 |

## Decisions (and why)
- **Victor's players, not the 6 Supabase personas** (user, 12:00): they already have full journeys and disruptions; the least risk before 16:00.
- **Same props as `CharacterSelect`:** a drop-in, so Victor's state machine and keys keep working and the 2D picker stays as the fallback. One optional extra prop, `playRef`, lets Stage's Enter run the dive (otherwise the keyboard would skip it).
- **DOM-first wrapper, dynamic canvas:**
  - The wrapper has no three.js import. It renders the page's text at once (sharp on a projector, accessible, SSR-safe).
  - The canvas chunk (three.js) is loaded with `next/dynamic({ ssr: false })`: three never runs on the server and is code-split from the demo.
  - The decision 3D vs 2D is made after hydration, so the server and client markup match.
- **Measured handoff instead of a hard-coded phone position:**
  - Stage lays the phone out differently with or without the HUD (≥ 1100 px).
  - The overlay measures the real phone (`data-phone-anchor`), so the light lands exactly on it.
  - It lives outside React so it survives the picker unmounting.
- **Halos instead of bloom:** bloom + MSAA at 1080p costs ~20–30 fps on an integrated GPU, and the automatic drop caused a visible switch. Sprites give the soft window glow for almost nothing.
- **CC0 people, procedural scenes:**
  - The user asked for real 3D people, and rigged CC0 models with animation clips beat anything procedural in the time we had.
  - For the scenes it was the reverse. The procedural Flemish house and coffee bar read more premium and on-brand than the CC0 Kenney buildings we evaluated. Those were downloaded with the user's approval and inspected clean, but they are not used and not committed.
- **Cover-flow, not a full ring:** Stage's arrows only switch between the two players, so a short list with the locked goals on the sides reads better than a wrapping ring that would show their backs.

## Known limits / improvement ideas
- **Not Supabase-backed:** Thomas and Lina are static (Thomas reuses the old €320k / "4 searches" signals; Lina isn't in Supabase), against the "Supabase is the only source of truth" rule. To align later: map Thomas → Supabase Sofie (house), Lina → Lucas (business), or add them to Simon's seed.
