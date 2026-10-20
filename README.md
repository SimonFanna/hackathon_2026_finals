<div align="center">

<img src="docs/screenshots/s6-finale.png" alt="Triple-win finale: Sofie, KBC and partners all gain from one journey" width="760">

**Customers don't fail because KBC lacks products. They fail because nobody turns their intent into a plan.**<br>
Kate notices a life moment, asks before assuming, and turns it into one step-by-step journey across KBC and its partners.<br>
The customer approves every step and every piece of data shared.

![Next.js](https://img.shields.io/badge/Next.js-16-0D2A50?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-0D2A50?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-0D2A50?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-RLS%20on-3ECF8E?style=flat-square)
![Data](https://img.shields.io/badge/data-100%25%20synthetic-5BA215?style=flat-square)

<sub>Built for the KBC challenge at the Tectonic Hackathon 2026 finals (Gent, 20 October 2026).</sub>

</div>

---

## The problem

KBC already offers **229 products and services across 21 ecosystems**, ~27 of them with partners (Immoscoop, Setle, Impact us today, Cambio, Billit…). That is the catalogue KBC gave us in [`resources/KBC_Ecosystems.xlsx`](resources/KBC_Ecosystems.xlsx).

For a customer, it is still a catalogue. They have to know what to look for, in which order, and from whom. The guiding question of the challenge is: *how can KBC help customers reach important goals **before they realise they need help**?*

Buying a house shows the gap well (KBC's own figures, see [`docs/assumptions.md`](docs/assumptions.md)):
- 66% of Flemish homes were built before 1981;
- the average renovation simulated with Setle costs about €48k;
- 71% of Belgians don't know which grants exist.

## What we built

**Intent → Journey**: an orchestrator that always runs the same loop.

| Step | What happens |
|---|---|
| **Signal** | Facts KBC can plausibly see (in-app loan simulation, EPC lookup, in-app Immoscoop searches for customers who opted into *extra convenience*) |
| **Intent** | A life moment with a confidence level: **no action**, **ask**, or **suggest**. Doing nothing is always an option. |
| **Journey** | A multi-step plan composed from KBC products and partner services in the catalogue |
| **Control** | Accept or skip each step; one plain sentence per partner saying what is shared, why, and for how long. Nothing is shared by default. |
| **Outcome** | A triple-win summary: what the customer, KBC and the partners each gain |

The hero demo is *"I'm buying a 1975 house"*. It runs in 11 steps over 4 chapters (find, finance, renovate, protect), voiced by Kate, in the KBC Mobile look.

<div align="center">
<img src="docs/screenshots/s2-intent.png" width="380" alt="Kate asks: are you planning to buy a home?">
<img src="docs/screenshots/s4-step-partner-consent.png" width="380" alt="One step: share your property address, EPC label and income bracket with Setle?">
</div>

## Run it locally

The site now opens with **Thomas's year**, a game-style introduction that makes the problem tangible before the guided demo. Navigate with the buttons, arrow keys or a presenter clicker. **Replay with Kate** starts Thomas's guided journey directly; **Skip intro** opens the existing player selector.

Presentation links: `/?pain=1` through `/?pain=7`, `/?pain=5&hit=2` for a particular setback, and `&still=1` for static slides. `/?intro=0` and all existing `?demo=...` links bypass the introduction. See [`pain-tunnel.md`](docs/features/pain-tunnel.md) for screenshot export and scenario assumptions.

```bash
git clone https://github.com/SimonFanna/hackathon_2026_finals.git
cd hackathon_2026_finals/web
npm install
npm run dev          # http://localhost:3000
```

| Script (in `web/`) | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Engine unit tests (Vitest) |
| `npm run lint` | ESLint |

The demo reads its customer and signals from Supabase (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `web/.env.local`, see `web/.env.example`). Without them, or offline, it runs on a bundled snapshot of the same rows.

### Demo controls (presenter)

| Key | Action |
|---|---|
| `→` / `Enter` | Next (the main action of the current screen) |
| `←` | Back |
| `S` | Skip the step (or "Not now" on the question screen) |
| `R` | Restart |
| `P` | Presenter panel: signals, confidence level, catalogue item, raw scoreboard |
| `W` | With the panel open: weak signals, so Kate stays silent (no action) |

Backup links: `/?demo=intent`, `/?demo=step&n=6`, `/?demo=finale`, `/?demo=weak`.

## Architecture

```
web/                      Next.js 16 + TypeScript + Tailwind v4
  src/engine/             pure TypeScript engine + Vitest tests (types, demo data, decide/consent/scoreboard)
  src/components/journey/ phone stage, screens S1–S6, consent sheets, presenter panel
  src/app/                layout (Nunito Sans), KDL design tokens, page
  public/brand/           official KBC logo (KDL asset library)
supabase/                 catalogue schema (RLS on, read-only) + seed generated from the XLSX
scripts/import_catalog.py XLSX → idempotent SQL seed
backend/backend.md        target backend design: events → signals → context → intent → goal → capabilities → plan → consent → outcome
docs/features/            one file per feature (UX redesign, security, journey V0)
docs/assumptions.md       every demo figure with its source or "estimate"
SOLUTION.md               the idea, differentiation, open questions, log
```

- **Decision-making is deterministic:** no language model decides anything.
- **Intent detection and confidence scoring** belong to the DB + ML team. The current engine scoring is a placeholder behind a stable contract (`DetectedIntent`).

## Data and security

- **100% synthetic customers.** The only external data is KBC's public catalogue (XLSX). See [`docs/assumptions.md`](docs/assumptions.md) for every figure; € / kWh / CO₂ values are illustrative estimates, and the UI says so.
- **Supabase:** RLS on, catalogue tables read-only for public roles. Keys live in environment variables, never in git (`.env*` is ignored; only `web/.env.example` has placeholders).
- **HTTP hardening:** strict CSP, `frame-ancestors 'none'`, `nosniff`, Referrer and Permissions policies, HSTS in production.
- **Aikido scan:** see [`docs/features/security.md`](docs/features/security.md).

## Deploying to Vercel (to do by a team member with a Vercel account)

1. On vercel.com, choose **Add New → Project** and import `SimonFanna/hackathon_2026_finals`.
2. Set the **Root Directory** to `web`. The framework preset is detected as Next.js; keep the default build (`npm run build`) and output settings.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase dashboard → API keys) so the demo reads live data; without them it falls back to the snapshot. **Never** put the secret key in a `NEXT_PUBLIC_` variable.
4. Deploy, then put the URL at the top of this README and in the Builderbase submission.

## Status: what is done, what is not

| Part | State |
|---|---|
| Engine: steps, consent per field, scoreboard, decision levels, tests | Done (placeholder scoring) |
| UI: KBC Mobile stage, Kate voice, S1–S6, presenter panel, deep links | Done (V1) |
| Catalogue import into Supabase (schema, seed, RLS) | Done; **not yet wired to journey steps** |
| Demo customer + signals read live from Supabase (offline snapshot fallback) | Done |
| Intent detection / confidence model | In progress (DB + ML team) |
| Second journey proving generalisation ("starting a business") | Not built; being redesigned as the possible new hero |
| Suppression rules, outcome tracker (from `backend/backend.md`) | Not built |
| Live URL (Vercel) | Not deployed yet |
| Aikido scan | Not connected yet |
| Pitch deck (PPT/PDF, 3 min) | In progress |

## Team

Four teammates and their coding agents, working in parallel on this repo (rules in [`CLAUDE.md`](CLAUDE.md)):
- **Kepa:** coordination, engine, UI;
- **Simon:** Supabase and catalogue data;
- **Mathias:** backend design and intent model;
- **Victor:** site.

## Notes

- KBC branding (KBC Design Language tokens, logo) is used for the KBC challenge only.
- KBC's typeface, Museo Sans, is commercial and is never committed. Nunito Sans is the stand-in.
- All amounts are illustrative estimates, not KBC rates or offers.
