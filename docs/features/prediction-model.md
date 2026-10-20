# Feature — Prediction model + synthetic data spec

> Owner: Simon's sessions (schema + generator: Supabase session · model + engine: to assign) · Status: spec, nothing built · Last update: 10:15

## Goal

Replace the hand-tuned signal weights (`buyHouseSignalWeights`, noisy-OR) with a **learned, explainable model** that scales to KBC's 2.3M app users, and show it on stage.

- **No LLM in the decision.** At 2.3M users, a per-customer LLM call is costly, non-reproducible and hard to audit.
- **Logistic regression per intent:** `confidence = sigmoid(b + Σ wᵢ·xᵢ)`. It is real ML, each weight is explainable as "why am I seeing this", and scoring takes about 1 µs per customer.
- **Event-driven:** only re-score customers whose signals changed. That is thousands per day, not millions.
- **Honesty line for the pitch:** "Initial weights are learned on synthetic data. In production they are retrained on real accept/skip feedback, which Kate's 125+ proactive situations already produce."

## 1. Entities

Catalogue tables (`ecosystems`, `partners`, `ecosystem_items`) stay as they are. The generated tables are separate and can be regenerated.

| Table | Kind | Columns (key ones) |
|---|---|---|
| `signal_types` | config | `code` PK, `label`, `source` (KBC Mobile / Immoscoop / transactions…), `description` |
| `intents` | config | `code` PK (`buy_house`, `start_business`), `label`, `threshold` |
| `intent_steps` | config | `intent_code`, `position`, `chapter` (text, **not** an enum: chapters differ per intent), `ecosystem_item_id` (via `source_row`), `why`, `data_shared text[]`, `outcome jsonb`, `condition jsonb` (nullable, e.g. `{"skip_if":"cash_buyer"}`) |
| `customers` | generated | `id`, `name`, `age`, `city`, `household`, `segment` (`private`/`self_employed`), `owns_home`, `income_band`, `tenure_years`, `is_demo` |
| `signals` | generated | `id`, `customer_id`, `type` → `signal_types.code`, `observed_at`, `attrs jsonb` (e.g. `{"build_year":1975,"epc":"E","amount":320000}`), `label` (human sentence for the UI) |
| `customer_intents` | generated = **label for model A** | `customer_id`, `intent_code`, `is_true` (latent ground truth), `confirmed_at` (customer said "yes, this is my project", or took the anchor product within 6 months) |
| `journeys` | generated | `id`, `customer_id`, `intent_code`, `started_at` |
| `journey_steps` | generated = **label for model B** | `journey_id`, `intent_step_id`, `decision` (`accepted`/`skipped`/`pending`), `consent_given bool`, `decided_at` |
| `model_weights` | output of training | `model_version`, `intent_code`, `feature`, `weight` (incl. `__bias__`), `trained_at`, `auc` |

The engine reads `model_weights` and keeps a JSON copy in `web/src/engine/` as the offline fallback.

## 2. Prediction targets

| | Target | Label | Features | Priority |
|---|---|---|---|---|
| **A** | P(intent \| customer, signals), one logistic regression per intent | `customer_intents.is_true` | one 0/1 per signal type present in the last 90 days, plus a few numeric (`n_property_search`, `days_since_last_signal`, `max_mortgage_sim_k€`) and customer attributes (`owns_home`, `age_band`, `segment`) | **Must-have.** This is the demo's "confidence" number. |
| **B** | P(step accepted \| customer, step) | `journey_steps.decision = accepted` | step (one-hot), provider = partner?, customer attributes, `consent_required` | Nice-to-have. Orders or hides steps, which makes the journey personalised. |

**Snapshot rule:** features use signals observed **before** an `as_of` date, and the label covers the 6 months **after** it. This avoids leakage.

## 3. Signal types

The generator draws each signal with **P(signal | intent)** and with a **base rate P(signal | no intent)**. The base rate creates false positives, so the model has something to learn (e.g. people browse Immoscoop for fun).

| code | intent | attrs | P(\|intent) | base rate |
|---|---|---|---|---|
| `property_search` | buy_house | `count`, `max_build_year` | 0.85 | 0.08 |
| `property_valuation` | buy_house | `price` | 0.40 | 0.01 |
| `mortgage_simulation` | buy_house | `amount` | 0.70 | 0.02 |
| `housing_budget_calc` | buy_house | `budget` | 0.50 | 0.02 |
| `epc_lookup` | buy_house | `epc` (A–F) | 0.45 | 0.01 |
| `savings_transfer` | both (weak) | `amount` | 0.50 | 0.15 |
| `notary_contact` | buy_house | `amount` | 0.30 | 0.005 |
| `freelance_income` | start_business | `monthly_eur`, `distinct_payers` | 0.75 | 0.04 |
| `start_it_visit` | start_business | — | 0.45 | 0.01 |
| `salary_stopped` | start_business | `last_employer_hash` | 0.35 | 0.02 |
| `equipment_purchase` | start_business | `amount`, `merchant_category` | 0.40 | 0.06 |
| `accounting_tool_payment` | start_business | `monthly_eur` | 0.30 | 0.01 |
| `business_account_sim` | start_business | — | 0.35 | 0.005 |

These numbers are starting values in the generator **config**, not KBC figures. Adjust freely.

**Volumes:**
- 10,000 customers in Supabase: buy_house prevalence about 4%, start_business about 2%, a few with both.
- Fixed demo personas with `is_demo = true`:
  - Sofie `c-001`: buy_house, 3 signals, confidence just below the threshold, so the app asks.
  - a start_business persona with high confidence;
  - a "nothing to suggest" persona;
  - a hard negative: browses Immoscoop but has no intent.
- The 2.5M scale benchmark is generated **in memory** by the scoring script and never stored.

## 4. Intent steps (mapped to `ecosystem_items.source_row`)

### `buy_house`
This is the current engine order, kept as is.

| pos | chapter | source_row | item |
|---|---|---|---|
| 1 | find | 15 | Search for a home - Immoscoop |
| 2 | find | 16 | Property valuation by an estate agent - Immoscoop |
| 3 | finance | 18 | Calculate housing budget |
| 4 | finance | 2 | Home loan · `skip_if: cash_buyer` |
| 5 | renovate | 14 | Certificates and inspections - De Immowinkel |
| 6 | renovate | 12 | Estimate renovation costs and grants - Setle |
| 7 | renovate | 131 | Insulation quote - Impact us today |
| 8 | renovate | 132 | Heating quote - Impact us today |
| 9 | renovate | 129 | Calculate solar panels and request a quote |
| 10 | finance | 128 | Energy loan |
| 11 | protect | 8 | Home insurance |
| *opt* | protect | 10 | Outstanding balance insurance (only if step 4 accepted) |
| *opt* | finance | 3 | Bridging loan (`only_if: owns_home`) |

### `start_business`
This is the generalisation proof.

| pos | chapter | source_row | item |
|---|---|---|---|
| 1 | start | 107 | Start it @KBC |
| 2 | start | 110 | Tax and legal advice for SMEs |
| 3 | set up | 79 | KBC Business PRO Account |
| 4 | get paid | 86 | E-invoicing - Billit |
| 5 | get paid | 123 | Bancontact Pro Online (`only_if: b2c`) |
| 6 | get paid | 88 | Send an expense claim to your accountant |
| 7 | protect | 188 | Professional liability insurance |
| 8 | protect | 195 | Guaranteed income insurance for the self-employed |
| 9 | future | 58 | Supplementary pension for the self-employed |

## Decisions

- Logistic regression rather than a tree or neural model: it is explainable per signal, it feeds the "why am I seeing this" panel directly, and it is fast.
- Training happens offline in Python (scikit-learn). Only weights reach the app, so there is no ML runtime in Vercel.
- `chapter` is free text, so the engine `Chapter` type must become `string` (or be driven by data) for `start_business`.

## Known limits / improvement ideas

- On synthetic data the model mostly re-learns the generator. Say so openly. The value shown is the pipeline and the explainability, not the AUC.
- The EPC renovation obligation and the Belgian B2B e-invoicing obligation (2026) still need to be verified with KBC staff before they appear in the UI.
- Model B is optional. Build it only if A is done and demoed.

## Status checklist

- [ ] Schema for generated tables + RLS read-only
- [ ] Generator config + deterministic script (fixed seed)
- [ ] Training script → `model_weights` + JSON fallback
- [ ] Engine switched from noisy-OR to logistic scoring (tests updated)
- [ ] 2.5M scoring benchmark script (time printed, for the pitch)
