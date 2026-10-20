# Feature — 3D persona carousel at app start
> Owner: peer session "README hackathon 2026" (ultracode) · Coordinator: kepa · App owner: Victor · Status: V1 on `main` (kepa 81f32f9, merged by the coordinator in 1556de3); art polish continues on `kepa` · Last update: 13:55

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
- [x] Carousel + entry animation work with keyboard, mouse/drag, and touch.
- [x] Fallback to the 2D picker is verified (WebGL off, `?q=low`, small viewport; `?q=auto` on a throttled GPU).
- [x] Full flow verified in a browser on a prod build: pick Thomas → full demo; C → back; pick Lina → full demo. No console or CSP errors (13:13, kepa 81f32f9).
- [x] fps measured on the GPU (`--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist`), high + fallback (table below).
- [x] `npm run lint`, `npm test`, `npm run build` green in `web/`.
- [x] Screenshots in `docs/screenshots/picker-3d/`; this doc + `SOLUTION.md` updated. Victor: Stage.tsx swap flagged "Victor FYI" in e8dbf30; the coordinator relays.

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
3. **Dive (950 ms).** The UI and its scrims leave (160 ms, 12 px down). In parallel, the turntable settles to face the camera (350 ms), the person cheers (Wave + one 0.12 hop), and the camera flies onto the lit window's axis:
   - ease-in-out, FOV → 26, the band view offset → 0;
   - it stops where the window fills 86% of the screen height;
   - the window's glow rises a little (×1.3, never clipped) and its halo fades out.
4. **Cover.** At 92% of the flight it projects the window's 4 corners and calls `cover(120, rect)`. A warm card lights exactly that rectangle while the night backdrop (260 ms) hides the rest of the scene. No full-screen flash on a dark projector.
5. **Mount.** `onPlay(id)` lets Stage switch to `home` behind the backdrop; the picker unmounts and disposes its WebGL context (its mount hitch is hidden).
6. **Land.** `land()` waits for `[data-phone-anchor]`, measures it, then:
   - morphs the window rectangle (WAAPI, 480 ms) into the phone screen: inset by the 10 px bezel × scale, 50 px radius × scale, warm → `#F2F2F2`;
   - fades the backdrop so the phone frame and the HUD appear around it;
   - fades the card out from 300 ms, so the home screen shows through as it lands. Kate's notification follows as before. About 1.7 s from Enter to the home screen.
7. **Reduced motion.** A 200 ms crossfade instead of the dive.

**Carousel:**
- Cover-flow order: retire · **Thomas** · **Lina** · baby · car.
- **Framing:** `CharacterSelect3D` measures the free band between the headline and the player card. `PickerCanvas` shrinks the FOV (never enlarges) and sets a camera view offset so the stage (roofs to plinth front) sits centred in that band; picking and the DOM overlay follow the camera. Under 860 px height the card collapses to one line of facts. Checked at 1920×1080, 1536×864, 1366×768 and 1280×720.
- Critically damped spring on a continuous `focus` index. A drag maps pixels to focus; release snaps to the nearest playable item. A tap is a raycast: a side item selects, the centred item plays, a locked item wiggles.
- Each diorama sways gently on its turntable; off under reduced motion.
- DOM over the canvas:
  - one focusable `role=radio` button per diorama, with `aria-label` (pointer-events off, so drags reach the canvas);
  - lock captions centred under the locked goals' plinths (hidden if they would overlap the card);
  - the player card (name, goal, stats, the 4 event badges from `EventBadge`, Play).

**People:**
- Two CC0 rigged and animated models by Quaternius ("Casual Character" → Thomas, "Animated Woman" → Lina; also the locked silhouettes). They were downloaded with the user's approval in the UI session, then inspected: pure glTF 2.0, no external URIs, no required extensions, no textures.
- Stored in `web/public/picker/` (1.43 + 1.49 MB); credits and SHA-256 in `web/public/picker/CREDITS.md`.
- `characterGltf.ts`:
  - loads each file once (same origin, works offline, no decoder, CSP unchanged) and clones per character with `SkeletonUtils`;
  - recolours with the tokens (Thomas top `#0097DB`, Lina dress `#00903D`, skin/hair as in Victor's avatars) and normalises to 1.1 units on the diorama's `stand`;
  - poses: `AnimationMixer` Idle; Wave when centred (every ~7.5 s); Wave + a 0.12 hop on Play, before the dive. Locked goals are dim night-blue silhouettes (dimmer rim).
  - merged + recomputed normals (soft, not faceted), a small emissive lift, a fresnel rim light, and a soft contact shadow under the feet (one quad, no shadow map) that tightens during the hop.

**Scenes (`dioramas.ts`, procedural):**
- Thomas: a stepped-gable Flemish brick house, slate roof, white frames, a lit window with a lamp (the dive target), FOR SALE sign, 4 moving boxes, hedges, a path.
- Lina: "LINA'S COFFEE" in navy with a striped awning, an espresso machine glowing behind the window, a COMING SOON A-frame, bistro tables with a steaming cup.
- Locked: a cottage + bench (retire), a house + stroller + balloons (baby), an electric car + wall box (car), each with a padlock. Their colours are compressed to night silhouettes so the two players lead; the padlock stays the one bright cue.
- Plinth: navy `#1E3D66` body with a steel ledge; a thin KBC-blue (`#0097DB`, unlit) selection ring under the centred plinth.
- People stand in front of the facades, turned slightly to the camera, clear of the window, door sign and boards.
- Canvas textures only.

**Render:**
- `WebGLRenderer` (DPR ≤ 1.5), ACES, hemisphere + key + rim lights. No point lights, no shadow maps. Fog `12.5 → 19.5` so the neighbours recede; an unlit radial floor pool under the centred scene.
- **Production default = high quality (user, 13:15): bloom (half resolution) over an MSAA ×4 half-float target, plus additive window halos. It never downgrades itself.**
- Manual quality switches (URL):

  | Switch | Effect |
  |---|---|
  | (none) | 3D, bloom + MSAA, no automatic downgrade |
  | `?bloom=0` | 3D, native MSAA, no bloom |
  | `?q=auto` | 3D with the fps governor: sustained < 45 fps for 2 s drops bloom; < 30 fps for 2.5 s hands over to the 2D picker |
  | `?q=low` | Victor's 2D picker |

- Always-on fallbacks: no WebGL2, a lost WebGL context, a narrow (compact) viewport or a deep link → the 2D picker.
- Debug: `window.__picker = { fps, calls, triangles, bloom }`.

## Measured performance (13:55, prod build, Intel Iris Xe, Chrome + Vulkan, GPU otherwise idle)
| Setting | fps idle (worst frame) | fps during the dive | Draw calls | Triangles |
|---|---|---|---|---|
| 1920×1080, default (bloom + MSAA ×4, DPR 1) | **52** (33 ms) | 50 | 118 | 38k |
| 1920×1080, `?bloom=0` (native MSAA + halos, DPR ≤ 1.5) | **60** (17 ms) | 60 | 104 | 38k |
| 1280×720, default | **60** (17 ms) | 60 | 118 | 38k |
| Fallback (Victor's 2D picker) | n/a (DOM only) | – | 0 | 0 |

Bloom costs about 8 fps at 1080p on this integrated GPU (quarter-resolution glow, DPR capped at 1 when bloom is on). On a weak presenter laptop use `?bloom=0` or `?q=auto`; there is no automatic downgrade by default (user decision).

Screenshots (prod build): `docs/screenshots/picker-3d/select-*.png`, `dive-1…5`.

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
- **High quality by default, no automatic downgrade (user, 13:15):** production (Vercel) runs bloom + MSAA. The governor stays available behind `?q=auto`, and `?q=low` / `?bloom=0` are the manual escape hatches for a weak laptop. Halo sprites stay as well: they carry the window glow when bloom is off.
- **The light lands on the window, not the whole screen (art review, 13:00):** a full-screen warm fill jumped mean brightness from 37 to 230 on a dark projector, and the window never visibly became the phone. Now the warm card covers about 30% of the frame and morphs from the window's own rectangle.
- **Kept as in Victor's 2D picker:** Lina's dress `#00903D` and the `text-kate` eyebrow (the art review suggested terracotta and `text-accent`). The players must look the same in 2D and 3D; changing his palette is Victor's call.
- **`devIndicators` untouched:** shared Next config. We present and take screenshots from a prod build (`next build && next start`) instead.
- **CC0 people, procedural scenes:**
  - The user asked for real 3D people, and rigged CC0 models with animation clips beat anything procedural in the time we had.
  - For the scenes it was the reverse. The procedural Flemish house and coffee bar read more premium and on-brand than the CC0 Kenney buildings we evaluated. Those were downloaded with the user's approval and inspected clean, but they are not used and not committed.
- **Cover-flow, not a full ring:** Stage's arrows only switch between the two players, so a short list with the locked goals on the sides reads better than a wrapping ring that would show their backs.

## Known limits / improvement ideas
- **Not Supabase-backed:** Thomas and Lina are static (Thomas reuses the old €320k / "4 searches" signals; Lina isn't in Supabase), against the "Supabase is the only source of truth" rule. To align later: map Thomas → Supabase Sofie (house), Lina → Lucas (business), or add them to Simon's seed.
