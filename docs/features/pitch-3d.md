# Feature — Pitch 3D "Lucas's World" (V1)
> Owner: peer session "README hackathon 2026" (ultracode) · Coordinator: kepa · Status: todo · Last update: 11:25

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
- [ ] `cd pitch3d && npm install && npm run dev` works; `npm run build` produces a static `dist/` that runs from `npx vite preview`.
- [ ] All 7 beats reachable by keyboard and by `?beat=N`; back works.
- [ ] Low-quality mode verified; fps measured in both modes (write the numbers here).
- [ ] One screenshot per beat in `docs/screenshots/3d/`.
- [ ] This doc updated (decisions, limits); `SOLUTION.md` feature table + log updated.

## Decisions (and why)
- Separate folder, not `web/`: Victor is working on the app; no merge conflicts, and the 3D can be embedded later (copy `dist/` into `web/public/3d/` or an iframe).
- three.js vanilla (not React Three Fiber): one self-contained scene, fewer dependencies, easier perf control.

## Known limits / improvement ideas
- Lucas's job in the brainstorm was "graphic designer"; Supabase says IT employee. We follow Supabase.
- Later: embed in the app, live Supabase read, sync beats with the phone demo.
