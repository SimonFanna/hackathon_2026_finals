# Feature — Demo V2: rework the steps of the in-app demo
> Owner: peer session "README hackathon 2026" (Fable 5.1) · Coordinator: kepa · App owner: Victor (tell him before touching his files) · Status: todo · Last update: 13:35

## Goal
Tighten the live demo for the pitch: no blocking UI, the entrepreneur first, a shorter post-plan phase, and a visible "it's being built" 3D moment. User decisions, 13:30. Backend = Simon's area.

## Work items, in priority order (time-boxed: features freeze 15:30, submission 15:45, hard freeze 16:00)

### P1 · Kate notification must not block the screen (bug) · by 14:00
- Today the notification (`HomeScreen.tsx`) can only be tapped to open; the rest of the screen can't be used.
- Wanted: tap/click **anywhere outside** the notification (or `Esc`) → the notification slides away and the home screen stays usable. A small **Kate pill** (Kate cyan `#55C7DF`, top of the home screen) reopens it; tapping the notification or the pill → the intent screen, as today.
- Keyboard/presenter: `→`/Enter on home still opens Kate (pitch flow unchanged).

### P2 · Carousel: entrepreneur is #1, locked goals removed · by 14:15
- Order: **Lina (business) first and selected by default**, then Thomas (house). Remove the 3 locked goals (baby, car, pension) from the 3D carousel **and** from Victor's 2D fallback. Drop the "locked goals: same engine, new data" hint; keep the scalability message elsewhere (finale/HUD) if there is one.
- Keys `1`/`2` follow the new order. `?player=` deep links unchanged. Default when there's no param = business.
- Reserve slot 3 for the "Your own" player (P5); don't show it until P5 exists.

### P3 · After the plan: one page per chapter + one page per unexpected event · by 14:45
- Today, after the plan the demo advances month by month (`live` ⇄ `event` ⇄ `options`), which is too long to click through.
- Wanted (user, 13:37: both): **one phone page per chapter** of the plan (`journey.chapters`, e.g. Find · Finance · Renovate · Protect): the chapter's accepted steps being done (status ticks, partner + data shared, the outcome line), with the goal health. **Interleaved** with **one page per disruption**: each event page comes right after the chapter page of the step it affects (if there is no link, by month order; fallback: after the last chapter). Sequence example: Find → [event 1] → Finance → [event 2] → Renovate → [events 3–4] → Protect → finale.
- Each event page (4 per player, from `persona.outcome.disruptions`). Each page shows: what happened (icon, one line, "You told Kate" for income/health), what broke (the constraint(s), before → after), the scored options with "Kate recommends", and the customer picks one → next page. After the last chapter page → finale.
- Keep the engine (`outcome.ts`: `hit`, `evaluateOptions`, `resolve`) as is; this is a UI/state-machine change. Reuse `EventScreen`/`OptionsScreen` pieces; merge them into one page per event. The HUD (right) keeps working.
- Keys: `1–4` pick an option, `→` = take Kate's recommendation. Deep link `?demo=event&n=N` lands on page N.

### P4 · 3D build on the left of the phone · by 15:20
- On stage ≥1100 px: **left of the phone**, the player's own diorama from the picker (`web/src/components/picker/dioramas.ts`): Lina's coffee bar, Thomas's house. It **builds piece by piece** as steps are accepted (scaffold → piece appears with a small dust/spark; skipped step → that piece stays as a ghost outline). A disruption hits → a short red flash/crack on the affected part; the customer's choice → it repairs. The finale → fully lit.
- Reuse the picker's three.js setup (same materials, lights, perf budget ≥ 50 fps on Iris Xe, `?q=low` and no-WebGL → hidden). Mount one canvas only, after the picker has unmounted.
- Layout: the presenter panel (key P) moves to an overlay so the left column is the 3D build. No third crowded column: phone centre, build left, HUD right.
- **Reference: the Exyro diagnostic intro** (`/home/kepa/Exyro/Diagnostic-Exyro/`: `src/three/building.js` builds the meshes, `src/intro/scene.js` is the timeline: floors drop in one by one with `springOut`, windows light up, the building turns to face the viewer, then the camera walks in). The user confirmed with the organisers (13:40) that **reusing this code is allowed**: adapt its build timeline/easing to our dioramas (one piece per accepted step), with KBC colours instead of the Exyro palette, and credit the source in a comment.

### P5 · Optional: "Your own" player, backend-driven · only if P1–P4 are done and verified
- A third carousel card: pick one of the 6 Supabase demo customers. Simon's adapter `web/src/lib/backend.ts` (`fetchIntent`, `startJourney`, …) detects the moment and builds the plan; only BUY_HOME and START_BUSINESS have plan templates (others → Kate explains "no plan yet" / NO_ACTION for Els/Thomas). Coordinate with Simon; don't edit `web/src/backend/`.

## Rules
- No "pain story" before the demo (user, 13:40): don't bring it back.
- Victor's files (`Stage.tsx`, journey screens, `personas.ts`, `CharacterSelect.tsx`): small, explicit diffs; put "Victor FYI" in those commit messages.
- Commit small on `kepa`, `git pull --no-rebase origin main` before pushing, never checkout/switch in the shared working tree. The coordinator merges into `main`.
- Each item: verify in a browser on a prod build (GPU flags: `--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist`); `npm run lint`, `npm test`, `npm run build` green; screenshot in `docs/screenshots/demo-v2/`; tick below.

## Status checklist
- [x] P1 notification dismiss + Kate pill (13:35, kepa)
- [x] P2 business first, locked goals removed (13:45, kepa)
- [ ] P3 one page per chapter + one page per event (interleaved)
- [x] P4 3D build on the left (13:55, peer agent on kepa's worktree; see `build-stage-3d.md`)
- [ ] P5 "Your own" player (optional)
