# SOLUTION — Intent → Journey

> Living document, updated throughout the day. Each feature has its own file in `docs/features/<feature>.md`.
> Last update: 10:05

## One-liner

**KBC notices that a customer is entering a life moment and turns that intent into a concrete, step-by-step journey combining KBC and its partners — with the customer in control at every step.**

## The problem

KBC already offers ~229 products and services across 21 ecosystems (Housing, Energy, Mobility, Business…), including ~27 partners (Immoscoop, Setle, Cambio, NMBS, Billit…). For the customer it is a fragmented catalogue: they must know what to look for, in which order, and from whom. The intent ("I'm buying a house") never becomes action.

## Our solution

An **orchestrator** that always runs the same loop:

1. **Signal** — an observed event (Immoscoop search, loan simulation, EPC lookup…)
2. **Intent** — inferred life moment with a confidence score. Below a threshold we *ask* the customer instead of assuming.
3. **Journey** — a multi-step journey composed from the KBC + partner catalogue.
4. **Customer control** — at each step: accept / skip, and choose which data is shared with which partner (off by default).
5. **Measurable outcome** — a triple-win view: value for the customer, for KBC, for partners.

**Scalability key:** a new intent = new *data* (intent + steps), not new code.

## Demonstrated journeys

### Hero — "I'm buying a 1975 house"
Immoscoop search → valuation → housing budget → home loan → renovation obligation (EPC) → renovation costs & grants via Setle → insulation / heating quotes → solar → energy loan → home insurance.
*Measurable:* € saved, kWh, CO₂, grants obtained.

### Generalisation proof — "I'm starting my business" (not built yet)
Start it → Business PRO → Billit invoicing → self-employed status, pension & insurance.

## Triple win

| Customer | KBC | Partners |
|---|---|---|
| A clear path, less effort, € and CO₂ saved | More products per customer, engagement, consented data | Qualified leads, at the right moment, with consent |

## Principles (from the KBC guide)

- **Bold** — we don't recommend a product, we orchestrate a life moment.
- **Scalable** — generic engine, data-driven intents.
- **Transparent & privacy-first** — consent per partner and per step, visible "why am I seeing this".
- **Commercially viable** — every step is a KBC product or a revenue-generating partner.

## Architecture

- **Front:** Next.js + TypeScript + Tailwind in `web/`, deployed on Vercel
- **Engine:** pure TypeScript in `web/src/engine/`, tested with Vitest; no LLM in decision-making
- **Data:** static synthetic data in the engine (V0); Supabase planned (`ecosystem_items`, `intents`, `intent_steps`, `customers`, `signals`; RLS on, read-only) with static fallback

## Out of scope (unless time allows)

Authentication, LLM decisioning, Kate voice, real partner integrations.

## Features (one file each in `docs/features/`)

| Feature | Owner | Status | Doc |
|---|---|---|---|
| Engine signal → intent → journey | coordinator (kepa) | done (V0) | `journey-house-v0.md` |
| Journey UI V0 | peer agent (kepa) | done, being redesigned | `journey-house-v0.md` |
| UX redesign (KBC brand, market benchmark) | peer agent (kepa) | in progress | `ux-redesign.md` |
| Supabase catalogue + data | Simon | in progress | — (Simon to add `supabase.md`) |
| Deck + demo (GIF/video) | — | todo | — |
| Security (Aikido) + public repo | — | todo | — |

## Open questions

- Which ecosystem KPIs does KBC use? (ask staff on site)
- Can we name partners in the demo / pitch?
- Verify the Flemish rule: buyers of an E/F-label home must renovate to at least label D within 5 years (used in the EPC step).

## Log

- **09:20** — Direction A validated. Document created.
- **09:50** — No Supabase access yet: V0 on static TS data. Engine `web/src/engine/` delivered (tests green); Next.js UI built.
- **10:05** — Supabase access OK (empty DB). V0 UI judged too cluttered → UX redesign started (KBC brand + market benchmark). `CLAUDE.md` team rules added; docs switched to English.
