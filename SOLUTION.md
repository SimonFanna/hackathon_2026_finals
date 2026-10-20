# SOLUTION — Intent → Journey

> Living document, updated throughout the day. Each feature has its own file in `docs/features/<feature>.md`.
> Last update: 10:32

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

## Differentiation

What KBC already does (verified):
- **MyHome** ([KBC press release, 29 Jan 2026](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf)): a dashboard in KBC Mobile since March 2026. It groups loans, insurance, renovation advice and energy insights, with the partners Setle, Eliq, Immoscoop, Impact us today and Immowinkel. It is **only for customers who opted into "extra convenience"**; Kate is the first point of contact.
- **Immoscoop inside KBC Mobile** ([kbc.be](https://www.kbc.be/retail/en/products/payments/self-banking/on-your-smartphone/mobile/immoscoop.html)): customers search homes, save searches, and Kate alerts them when a matching home goes online. KBC shares the customer's name and email with Immoscoop.
- **Feasibility certificate (haalbaarheidsattest)** ([Immoscoop press release](https://www.immoscoop.be/content/blog/persbericht-bereal-kbc-en-immoscoop-lanceren-haalbaarheidsattest-voor-kandidaat-kopers), around Aug 2026): per property, it shows whether an offer looks affordable. Once the offer is accepted, the customer can go straight to a KBC loan application with the data reused. This is the closest existing piece to our journey.

So our pitch is **not** "we bundle housing partners", and not "Immoscoop to mortgage". What we add:
- **proactive detection** from signals;
- a **sequenced plan** across ecosystems (housing → finance → energy → insurance), not a toolbox;
- **per-step, per-partner consent**;
- a **measured triple win**;
- **one generic engine**, where a new intent is new data.

**Our assumption (not documented publicly):** KBC uses in-app Immoscoop saved searches as an intent signal. It is plausible (the search runs inside KBC Mobile and Kate already sends the alerts), and we gate it on the same "extra convenience" opt-in KBC uses for MyHome. Pitch line: *proactive detection only runs for customers who opted in, exactly like MyHome today.*

This also matches KBC's own line on Kate: *"Kate will never implement anything without explicit customer approval"* ([KBC newsroom, Nov 2025](https://newsroom.kbc.com/kate-five-years-and-five-milestones)).

## Architecture

- **Front:** Next.js + TypeScript + Tailwind in `web/`, deployed on Vercel
- **Engine:** pure TypeScript in `web/src/engine/`, tested with Vitest; no LLM in decision-making
- **Data:** static synthetic data in the engine (V0); Supabase planned (`ecosystem_items`, `intents`, `intent_steps`, `customers`, `signals`; RLS on, read-only) with static fallback

## Out of scope (unless time allows)

Authentication, LLM decisioning, Kate voice, real partner integrations.

## Features (one file each in `docs/features/`)

| Feature | Owner | Status | Doc |
|---|---|---|---|
| Journey engine (steps, consent, scoreboard) | coordinator (kepa) | done (V0) | `journey-house-v0.md` |
| Intent detection & confidence scoring (signals → intent, levels none/ask/suggest) | DB + ML team | todo — engine has a placeholder (`detectIntents`, thresholds 0.4/0.75) to replace; keep the `DetectedIntent` contract | `backend/backend.md` |
| Journey UI V0 | peer agent (kepa) | replaced by UX redesign V1 | `journey-house-v0.md` |
| UX redesign V1 (KBC brand, Kate voice, phone stage, triple-win finale) | peer agent (kepa) | done (V1) | `ux-redesign.md` |
| Supabase catalogue + data | Simon | in progress | — (Simon to add `supabase.md`) |
| Deck + demo (GIF/video) | — | todo | — |
| Security (Aikido) + public repo | — | todo | — |

## Open questions

- Which ecosystem KPIs does KBC use? (ask staff on site)
- Can we name partners in the demo / pitch?
- **MyHome / Immoscoop signals:** ask KBC staff whether in-app Immoscoop saved searches may be used as a signal under "extra convenience". Position us as the proactive, sequenced layer on top of MyHome.
- Verify the Flemish rule: buyers of an E/F-label home must renovate to at least label D within 5 years (used in the EPC step).

## Log

- **09:20** — Direction A validated. Document created.
- **09:50** — No Supabase access yet: V0 on static TS data. Engine `web/src/engine/` delivered (tests green); Next.js UI built.
- **10:05** — Supabase access OK (empty DB). V0 UI judged too cluttered → UX redesign started (KBC brand + market benchmark). `CLAUDE.md` team rules added; docs switched to English.
- **10:20** — UX redesign V1 shipped in `web/`: a KBC Design Language look (tokens read live from kbc.be), Kate's voice, one step at a time with a consent sentence per partner, a hidden presenter panel (key P) and a triple-win finale. Screenshots in `docs/screenshots/`. MyHome finding added (Differentiation, Open questions).
- **10:32** — MyHome verified (KBC press release, 29 Jan 2026, opt-in "extra convenience"). Immoscoop × KBC integration and haalbaarheidsattest documented. Our Immoscoop-signal assumption is labelled and gated on the same opt-in.
