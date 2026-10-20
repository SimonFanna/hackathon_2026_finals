# Feature — Pitch 3D "Lucas's World" (V1)
> Owner: peer session "README hackathon 2026" (ultracode) · Coordinator: kepa · Status: **paused** (V1 working on `kepa`, set aside by the user as too big) · Last update: 11:48

## Goal
A cinematic 3D miniature world, driven live during the 3-minute pitch, that shows the solution loop (signals → context → KBC + partners → customer in control → outcome, triple win) through the **entrepreneur** journey of Lucas. Creativity + Pitch = 50% of the score.

**Outside the app for now:** Victor works in `web/`. The 3D lives in its own folder, `pitch3d/`, and never touches `web/`.

## Hero (data from Supabase, `customers.demo_slug = 'lucas'`, id 2)
- Lucas, 29 (born 1997-08-24), Leuven. Employee in IT at Brabo Consulting since 2023, €2,733 net/month. Wants to go self-employed.
- Signals in `app_events`: views of *Start it @KBC*, *KBC Business PRO Account*, *E-invoicing*, *Bancontact Pro Online*, *Guaranteed income insurance for the self-employed*, *Professional liability insurance*, *Tax and legal advice for SMEs*, plus Kate questions (Sept 2026).
- Rule: **Supabase is the only source of truth.** V1 uses a JSON snapshot of these rows (query them once, commit `pitch3d/src/data/lucas.json`); a live read with the publishable key (same pattern as `web/src/lib/bankClient.ts`) is optional.

## Story beats (one key press = one beat)
| # | Beat | What we see |
|---|---|---|
| 0 | **Lucas's world** | Night miniature Leuven. Lucas's small apartment/desk glows. Caption: name, age, city, "employee, thinking of going solo". |
| 1 | **Signals** | Small light pulses travel from his building to the KBC tower, one per real signal (labelled: "Viewed Start it @KBC", …). |
| 2 | **Kate asks** | A Kate-cyan ring fills to the confidence level → "ASK". Kate's line: "Thinking of starting your own business?" Lucas says yes. |
| 3 | **Build the business, step by step** | Each accepted step builds his workshop (scaffold → crane → particles → finished piece): Start it @KBC → Business PRO account → e-invoicing (partner) → protection (guaranteed income + liability, partner) → working capital. |
| 4 | **Consent as light** | A beam links Lucas's building to a partner building **only** when he shares data; the partner then lights up. One step is declined: no beam, that partner stays dark (customer in control). |
| 5 | **Domino, not dominoes** | The next life moments light up as new districts around him (e.g. a home district, a family district). **No literal dominoes** (rejected). |
| 6 | **Finale: Belgium** | The camera rises from Leuven to all of Belgium: thousands of lights = millions of customers. Triple-win counters (customer / KBC / partners), labelled "estimates". |

Controls: `→` / `PageDown` / `Space` = next · `←` / `PageUp` = back · `R` = restart · `Q` = toggle low quality · `?beat=N` deep link · `?q=low`. (A presenter clicker sends PageDown/PageUp.)

## Constraints
- **Stack:** `pitch3d/` = Vite + TypeScript + three.js, pinned versions + lockfile. Procedural geometry and `InstancedMesh`; no heavy downloaded models. Any asset is local and CC0.
- **Runs offline** on an unknown pitch device without a dedicated GPU: everything bundled (no CDN). Target 60 fps at 1080p on an integrated GPU; **low-quality mode** (no bloom, pixelRatio 1, fewer instances/particles) via `Q` or `?q=low`, auto-enabled if fps stays < 30.
- **Brand:** KBC tokens (`docs/features/ux-redesign.md`): night blue `#0D2A50` / `#021E43`, single accent `#0097DB`, Kate `#55C7DF` (Kate only), green `#1DB955` (energy/CO₂ only). Font Nunito Sans (bundled). Restrained, cinematic, not cartoonish.
- English copy. All €/kWh/CO₂ figures labelled as estimates. No secrets. No code from the qualifier repo.
- Respect `prefers-reduced-motion` (cuts instead of camera flights).

## Definition of done (V1)
- [x] `cd pitch3d && npm install && npm run dev` works; `npm run build` produces a static `dist/` (one 659 kB JS chunk incl. three.js, fonts bundled, relative base). `vite preview` not re-checked after the last commit.
- [x] All 7 beats reachable by keyboard and by `?beat=N`; back works (idempotent director). Checked in headless Chrome.
- [x] Low-quality mode works (`Q`, `?q=low`, auto when fps < 30); fps measured in both modes (below). **Below the 60 fps target in high**, see the next steps.
- [x] One screenshot per beat in `docs/screenshots/3d/` (`beat-N-high.png`, 1600×900, captured on the Intel Iris Xe GPU).
- [x] This doc updated; `SOLUTION.md` feature table + log updated.

## Measured fps (11:45, Intel Iris Xe integrated GPU, Chrome + Vulkan, 1920×1080, DPR 1)
| Mode | Beat 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| High (bloom, shadows) | 30 | 36 | 25 | 29 | 36 | 47 | 54 |
| Low (no bloom, no shadows, 40% density) | 50 | 52 | 44 | 40 | 51 | 59 | 54 |
| Auto (starts high, drops to low) | 36 | 42 | 31 | 26 | 38 | 56 | 58 |

Steady-state fps per beat; the minimum during transitions was ~6–10 fps lower. Auto mode is slower than explicit low because the scene is built at high density before it drops.

## Next steps when resumed (perf first)
1. Shadows: render the shadow map once (`shadowMap.autoUpdate = false`), refresh only when the studio changes stage.
2. Remove the Lucas `PointLight` (the glow pool already sells it); move city walls/roofs/ground to `MeshLambertMaterial`.
3. Bloom at half resolution; in auto mode also trim the dense field (`setDrawRange`) and sparks when dropping to low.
4. Art pass: beat 3 camera a bit wider; a loading state for the cold load (659 kB).
5. Re-measure; target ≥ 55 fps high / 60 low on the Iris Xe.

## Data actually used (Supabase snapshot, 2026-10-20)
- **Snapshot file:** `pitch3d/src/data/lucas.json`. It holds the customer row, the employment row, the children count (0), **all 137 `app_events`** with their `ecosystem_items` (name, ecosystem, partner), the 21 ecosystems, the 28 partners, and the customer count per city (2,000 synthetic customers in 23 cities).
  - The rows were read through the Data API with the publishable key, exactly what the app sees through RLS.
  - The city counts are an aggregate read through the Supabase MCP. They contain no personal data.
- **Entrepreneur signals (beat 1):** Start it @KBC (8 views), Tax and legal advice for SMEs (4), E-invoicing (3), Professional liability insurance (3), KBC Business PRO Account (2), Guaranteed income insurance for the self-employed (2), Bancontact Pro Online (2), KBC Business app (1). Kate questions: "How do I open a business account?", "How do I send invoices?", "Do I need a VAT number as a freelancer?".
- **Partners in the catalogue:** e-invoicing is **Billit** (partner). Guaranteed income insurance and professional liability insurance have **no partner** in the catalogue (KBC products), so **protection is a KBC step**, not a partner step. The declined partner step is **Go Solid** ("Collect unpaid invoices"), the other Business partner. *(Deviation from the beat table above: the data wins.)*
- **Next life moments (beat 5), from Lucas's own views:**
  - **Home**: Calculate housing budget, Bridging loan;
  - **Mobility**: Plug-in hybrid car loan, Calculate monthly car costs;
  - **Pension**: Pension savings fund.
  - There is no family district: Lucas is single with no children.
- **Finale lights (beat 6):** 2,000 points = the 2,000 synthetic customers of our bank, placed on their real cities (Antwerpen 293, Gent 242, Leuven 171 …), with small random jitter. Caption: "Every light is a customer of our synthetic bank. Same engine for each one."

## Implementation plan (V1)

**Goal:** a standalone, offline three.js scene with 7 keyboard-driven beats telling Lucas's journey from Supabase data.

**Architecture:**
- Pure TypeScript modules (story data, beat state machine, quality governor) are unit-tested with Vitest.
- One three.js scene graph (procedural, `InstancedMesh`) is driven by a director that applies a beat **idempotently**, so back, restart and `?beat=N` land on the same state.
- An HTML overlay holds the captions and counters.

**Stack (pinned):** vite 8.3.4, three 0.186.1, @types/three 0.186.0, typescript 5.9.3, vitest 5.0.5, @fontsource/nunito-sans 5.3.0 (bundled font, no CDN).

**Files (`pitch3d/`):**
| File | Responsibility |
|---|---|
| `src/data/lucas.json` | Supabase snapshot (above) |
| `src/story.ts` | Pure: snapshot → hero, signals (grouped business views + Kate questions), journey steps (catalogue item, KBC/partner, shared or declined), next-moment districts, city lights |
| `src/beats.ts` | Pure: beat index, next/prev/reset, `?beat=N` parsing, key → action map |
| `src/quality.ts` | Pure: `high`/`low` presets + fps governor (switch to low if the 2s average < 30 fps) |
| `src/scene/world.ts` | Night Leuven miniature: ground, instanced blocks with emissive windows, Lucas's building, KBC tower, partner buildings, districts |
| `src/scene/effects.ts` | Signal pulses, Kate ring, workshop build-up, consent beams |
| `src/scene/belgium.ts` | Finale: Belgium outline + 2,000 city lights |
| `src/director.ts` | Beat → targets (camera shot, visibility, light levels); tweens between them; cuts under reduced motion |
| `src/ui/overlay.ts`, `src/style.css` | Captions, signal labels, Kate line, triple-win counters ("estimate" labels), beat dots |
| `src/main.ts` | Renderer, bloom (high only), loop, input, URL params |

**Tasks:**
1. Scaffold the Vite + TS app, pin versions, add a Vitest config; commit.
2. `lucas.json` + `story.ts` + tests (signal counts, partner flags, districts, city totals = 2,000); commit.
3. `beats.ts` + `quality.ts` + tests (bounds, key map, deep link clamp, governor threshold); commit.
4. World + beat 0 rendering (milestone: "first beat rendering"); commit.
5. Beats 1–4 (pulses, Kate ring, build-up, beams with a dark declined partner); commit.
6. Beats 5–6 (districts, Belgium finale, counters); commit.
7. Low quality, auto-fallback, reduced motion, `?q=low`; commit.
8. Verification:
   - `npm run build` + `vite preview`;
   - a Playwright pass over all beats (screenshots to `docs/screenshots/3d/`);
   - fps in both modes;
   - doc + `SOLUTION.md`; merge to `main`.

## Decisions (and why)
- Separate folder, not `web/`: Victor is working on the app; no merge conflicts, and the 3D can be embedded later (copy `dist/` into `web/public/3d/` or an iframe).
- three.js vanilla (not React Three Fiber): one self-contained scene, fewer dependencies, easier perf control.
- **Protection is a KBC step and Go Solid is the declined partner**, because that is what the catalogue says (see "Data actually used").
- **Districts come from Lucas's own page views** (home, mobility, pension). No invented family district.
- **Finale lights = our 2,000 synthetic customers on their real cities.** The truth is the claim; any "millions" figure is a sourced caption (Kate serves 5.8M digital customers, KBC newsroom Nov 2025).
- **Triple-win counters are counts from the journey**, not invented euros:
  - Lucas: steps done in one flow;
  - KBC: products activated;
  - partners: consented leads, and 1 declined.

  Every number is labelled "estimate" or "demo".
- **Bloom only in high quality** (`UnrealBloomPass` from three's examples, bundled). Low quality = pixelRatio 1, no bloom, no shadows, half the window instances.

## Known limits / improvement ideas
- Headless Chrome on this machine defaults to SwiftShader (CPU, ~1 fps). Use `--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist` to get the Iris Xe for captures and fps.
- Lucas's job in the brainstorm was "graphic designer"; Supabase says IT employee. We follow Supabase.
- Later: embed in the app, live Supabase read, sync beats with the phone demo.
