# Feature — 3D build stage (the player's diorama builds as the plan is accepted)
> Owner: peer agent (kepa, Fable 5.1) · Status: done (V1) · Last update: 13:55 · Demo V2 item P4 (`demo-v2-steps.md`)

## Goal
On the stage (>= 1100 px wide), left of the phone, the player's own diorama from the picker (Lina's coffee bar,
Thomas's house) **builds piece by piece as plan steps are accepted**: a cyan scaffold (ghost outline) first,
each accepted step drops its pieces in with a bounce and a puff of dust; a skipped step stays an outline; a
disruption flashes red and cracks (sags) the affected part; the customer's choice repairs it; the finale lights
the windows and the person cheers. Phone centre, build left, engine HUD right; the presenter panel (key P) is
an overlay, no third column.

## How it works
- `web/src/components/build/BuildStage.tsx` — wrapper used by `Stage.tsx`. Decides on the client whether to
  mount (`?q=low` → nothing, no WebGL → nothing, lost context → unmounts) and code-splits the canvas
  (`next/dynamic`, `ssr: false`, like `CharacterSelect3D`). Exports `affectedStep(pending)`: the step a
  disruption's options change (Kate's recommendation first), null → the whole building.
- `web/src/components/build/BuildCanvas.tsx` — vanilla three.js in one effect, same render setup as the picker
  (ACES, hemisphere + key + rim, bloom over an MSAA target at DPR 1, fog, no shadow maps, no point lights).
  Props (all derived from `Stage` state, nothing new in the state machine):

  ```ts
  { persona: "house" | "business"; steps: string[] /* ids, journey order */; accepted: string[]; skipped: string[];
    hit: { step: string | null; n: number } | null /* n = Stage's shock counter */; repaired: number /* run.history.length */;
    finale: boolean; onFail?: () => void }
  ```
  The props are diffed every frame (a few ids): a new accepted id queues its pieces (140 ms cascade), a new
  skipped id turns its pieces into a dim outline, a step going back to pending (customer pressed back) returns
  to the cyan scaffold, a new `hit.n` flashes + sags the affected pieces, a higher `repaired` springs them back,
  `finale` turns the turntable to face the viewer, walks the camera in, lights the windows (`setFocus` 0.55 → 1.6)
  and makes the person cheer. On a remount with decisions already made (deep links, `?demo=`), everything is
  placed without animation. `window.__build.fps` exposes the frame rate.
- `web/src/components/picker/dioramas.ts` — the pieces. `buildDiorama(id, kit, { phased: true })` makes the
  `Builder` merge geometry per material **and per build phase** and puts each phase in its own
  `THREE.Group` (`name "phase:N"`, `userData.phase`); loose objects (the hero window, swinging signs, steam)
  are tagged with `userData.phase` and moved into their group. `Diorama.parts[n - 1]` = phase n. Without
  `phased` (the carousel) nothing changes: same merge, same draw calls. `BUILD_PHASES` gives the count per
  diorama and `phasesForStep(i, steps, phases)` (unit-tested) spreads the journey steps over the phases.
- `web/src/components/journey/Stage.tsx` (Victor's file, layout only): `showBuild`, the `skipped` memo, the
  `<BuildStage>` in the left slot of the flex row, the presenter panel wrapped in an absolute overlay.

### Pieces ↔ steps
Step i (journey order) owns phases `phasesForStep(i, steps.length, BUILD_PHASES[persona])`; with 11 house
steps / 11 phases and 10 business steps / 10 phases that is one phase per step, in build order:

| # | House (Thomas) step → piece | Business (Lina) step → piece |
|---|---|---|
| 1 | search → facade, body, back gable | start-it → upper floor, cornice, mansard, chimney |
| 2 | valuation → socle, bands, lintels, coping | pro-account → the shopfront (slabs, corner, piers, mouldings) |
| 3 | budget → the door, lantern, number plate | investment-loan → interior: counter, espresso machine, pendants |
| 4 | home-loan → the hero window | terminal → side window frame + the glass |
| 5 | epc → attic window, oculus | billit → the fascia |
| 6 | grants → side and back windows | nowjobs → the awning |
| 7 | insulation → roof slates, gutters, downpipes | go-solid → the cup sign |
| 8 | heating → ridge and chimney | liability → upper-floor windows, dormers |
| 9 | solar → garden path, hedge | income-insurance → the terrace (tables, chairs, steam) |
| 10 | energy-loan → moving boxes, bay tree | pension → A-frame + the light on the ground |
| 11 | home-insurance → FOR SALE sign + the light on the ground | — |

The plinth is phase 0 (always there). The person drops in once every step is decided (plan complete) and
waves; a disruption hits the piece of the step its options change (house: rate-rise → home-loan → the hero
window; business: fit-out-delay → terminal → the glass), or the last two built pieces when no step is linked.

## Decisions (and why)
- **Build timeline adapted from the Exyro diagnostic intro** (`Diagnostic-Exyro/src/three/building.js`
  `springOut`/`animateBuild`, `src/intro/scene.js`): one piece per accepted step instead of one floor per
  0.26 s, 0.7 s drop from 3 units above, dust when `springOut` first crosses 1, the building turns to face the
  viewer and the camera walks in at the finale. Reuse confirmed with the organisers (13:40); credited in the
  file header. KBC colours (Kate cyan scaffold, KBC red flash, warm window light), not the Exyro palette.
- **Ghost = wireframe of the real piece** (one shared `MeshBasicMaterial`, no extra geometry): the scaffold is
  exact, costs nothing to build and the swap back to the real materials is a pointer change.
- **Phases are opt-in in `dioramas.ts`** so the carousel's draw calls and look are untouched; the build stage
  pays ~55 draw calls for one diorama instead of ~20, well inside budget.
- **One canvas at a time**: the picker unmounts on play (`screen !== "select"`) before the build mounts.
- **No new state in Stage**: accepted/skipped come from `state.decisions`, the hit from `pending` + `shock`,
  the repair from `run.history.length`, so the backend-driven flow (Simon) and the P3 page rewrite don't
  need to know about the build.
- Hidden at the stage finale under 1600 px (the Finale panel is 660 px wide and is the hero there).

## Known limits / improvement ideas
- The "crack" is a sag + red flicker + sparks, not a fracture; a crack decal on the piece would read better.
- A hit on a glass-only piece (business step 4, the glass) flashes faintly: the additive glass takes the red
  poorly. Could flash the whole shopfront group too.
- The person's "cheer" is the Wave clip (no cheer clip in the CC0 models), with a hop.
- The presenter overlay covers part of the build; it is jury-only, so acceptable.
- Not tested on a real Iris Xe yet: 60 fps in headless Chrome (Vulkan ANGLE) at 1920 × 1080 in every phase;
  the budget is the picker's (bloom at DPR 1, quarter-res bloom pass).

## Status checklist
- [x] `dioramas.ts` build phases (opt-in) + `phasesForStep` tests
- [x] `BuildCanvas` / `BuildStage`, dynamic import, capability-gated
- [x] Stage layout: build left, phone centre, HUD right, presenter overlay (Victor FYI)
- [x] Verified on a prod build, headless GPU Chrome 1920 × 1080: `?player=business` and `?player=house`, build
  partial → hit → choose → finale, 60 fps throughout, 0 console errors. Screenshots:
  `docs/screenshots/demo-v2/p4-build-{partial,hit,finale}.png` (Lina), `p4-build-house-*.png` (Thomas),
  `p4-presenter-overlay.png`.
- [ ] Check on the pitch laptop (Iris Xe) once; fall back with `?q=low` if under 50 fps
