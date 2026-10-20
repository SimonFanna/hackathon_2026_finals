# Feature — Synthetic bank (schema + data generator)

> Owner: Simon (this session) · Status: done, tested locally, not yet applied to Supabase · Last update: 10:55

## Goal

A small but realistic bank database, so Mathias can build the backend and we can train the ML models (clustering into personas, life-moment detection) before the 16:00 freeze.

It holds 2,000 customers with 6 months of history (2026-04-01 → 2026-09-30). The data is 100% synthetic.

## How it works

| File | Role |
|---|---|
| `supabase/migrations/20261020110000_bank_core.sql` | Schema, indexes, RLS. Applied after `20261020100000_catalog.sql`. |
| `scripts/bank_data/config.py` | **All generation rules as data**: personas, life moments, probabilities, pages per moment, merchants. |
| `scripts/bank_data/generate.py` | Deterministic generator (fixed seed, about 5 s). Writes CSVs + `demo_personas.sql` into `scripts/bank_data/out/` (git-ignored). |
| `scripts/bank_data/load.sql` | Full load through psql `\copy`. One transaction, re-runnable (truncates the generated tables, never touches the catalogue). |

```bash
python3 scripts/bank_data/generate.py                           # [--customers N] [--seed S]
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/bank_data/load.sql   # run from the repo root
```

`DATABASE_URL` is the Supabase **Session pooler** string. It never goes into git. For a lighter path, `out/demo_personas.sql` loads only the 6 demo personas with plain INSERTs, which works in the SQL editor or MCP.

### Tables (facts only: what KBC could plausibly observe)

| Table | Rows (seed 20261020) | Content |
|---|---|---|
| `customers` | 2,000 | name, birth date, gender, language, city/postal code/region, marital status, segment (private / self_employed / business_owner), `is_demo`, `demo_slug` |
| `customer_children` | ~1,950 | first name, birth date. New parents get a child born during the period. |
| `customer_employment` | 2,000 | status (employee, self_employed, business_owner, student, retired), sector, employer / own company, synthetic VAT, net monthly income |
| `customer_housing` | 2,000 | owner / tenant / with_parents, rent |
| `properties` | ~1,200 | house/apartment, build year, EPC label, value, acquisition date |
| `accounts` | ~4,100 | current / savings / business_current / term_deposit, end-of-period balance. FK to the catalogue. |
| `loans` | ~1,800 | home, renovation, energy, car, personal, business_investment. Annuity, outstanding amount, status. FK to the catalogue. |
| `product_holdings` | ~13,000 | insurance, cards, pension, investing, Kate… with monthly premium. FK to the catalogue. |
| `transactions` | ~427,000 | signed amount, 34 categories, merchant/counterparty |
| `app_events` | ~214,000 | KBC Mobile / Touch / Kate. Event types: `page_view`, `simulation` (with amount), `search`, `kate_question` (with text), `application_started/completed`. Each is linked to the catalogue service consulted. |
| `ml.customer_truth` | 2,000 | **Hidden ground truth**: latent persona, life moment, start date, converted. Lives in schema `ml`, not exposed through the API. Used only for training and evaluation. |

### Personas and life moments (latent: models must rediscover them)

- **8 personas:** student, young_professional, young_family, established_family, self_employed, business_owner, pre_retiree, retiree.
- **5 life moments:**

| Moment | Share | Anchor product ("converted") |
|---|---|---|
| `buy_house` | ~7% | home loan |
| `start_business` | ~5% | Business PRO account |
| `new_parent` | ~3% | Save for someone else |
| `buy_ev` | ~6% | electric car loan |
| `prepare_retirement` | ~4% | pension savings fund |

  The other ~75% have no moment. Moments are over-represented on purpose, so a model can learn from 2,000 customers.

- **What a moment changes:**
  - in-app pages and simulations (e.g. home loan, housing budget, Immoscoop inside the app);
  - Kate questions;
  - money behaviour: savings boost and frugality for house buyers; freelance invoices, laptop, accounting tool and possibly a stopped salary for founders; baby shops and hospital for new parents; car loan ending for EV buyers; lump-sum investing for retirement.
- **Built-in realism:**
  - casual noise views for everyone;
  - 15% of customers without a moment are *curious* (they browse a topic but never act);
  - in-app engagement varies (25% of customers in a moment barely use the app);
  - only 70% show money signals.
- **Detectability check:** a plain logistic regression on per-customer counts, 5-fold cross-validated, gets **AUC 0.96–0.99 and AP 0.80–0.97** depending on the moment. Strong, but with real errors to discuss.

### Demo personas (`is_demo = true`, ids 1–6)

| slug | Who | Truth |
|---|---|---|
| `sofie` | 32, Gent, couple + 1 child, tenant | buy_house (recent, not converted): the hero |
| `lucas` | 29, Leuven, single, employee | start_business: freelance invoices arriving |
| `nadia` | 31, Antwerpen, couple, owner | new_parent |
| `pieter` | 49, Mechelen, 2 teens, owner, car loan ending | buy_ev |
| `els` | 44, Brugge, owner, already well equipped | none: "nothing to suggest" |
| `thomas` | 27, Kortrijk, tenant | none, but browsed Immoscoop / home loan pages: hard negative |

## Decisions

- **Facts vs interpretations** (as in `backend/backend.md`): this layer has no signals, intents or journeys. The backend derives them. Only KBC-observable events are generated (in-app pages, transactions, products), so there are no external browsing histories.
- **Catalogue by `source_row`:** the CSVs carry the Excel row and the loaders resolve it. Database ids are never assumed. The load fails loudly if a row is missing.
- **Security:**
  - RLS on every table. anon/authenticated can read **only demo personas**; the full bank is read server-side with the secret key.
  - Writes are revoked.
  - `ml` schema access is revoked, and RLS is on with no policy.
- **Synthetic identifiers that cannot be real:**
  - IBANs use the invalid check digits `BE00…`;
  - VAT numbers deliberately fail the mod-97 check;
  - emails use `@example.com`.
- CSVs are git-ignored (about 43 MB). The generator is deterministic, so the same seed gives the same files.

## Known limits / improvement ideas

- The 6-month window is short, so "moment started" is always within the last 5 months. A 12-month window would allow before/after features, at the cost of about twice the rows.
- One moment per customer at most: real people can stack moments (house + baby).
- Incomes and amounts are illustrative, not calibrated on Belgian statistics.
- `search` events are defined in the schema but not generated yet.

## Status checklist

- [x] Schema + RLS, tested on local Postgres 14 (same version as Simon's psql)
- [x] Generator, deterministic (~5 s)
- [x] Full load via `\copy` (7.6 s locally, re-runnable) + demo-only SQL tested on an empty DB
- [x] RLS checked as anon: only the 6 demo personas are visible, `ml` is denied
- [x] Migration applied on Supabase `endbafjcxanzmlwiezwe`. The advisors raise only the expected INFO "RLS, no policy" on `ml.customer_truth`; anon/authenticated have no access to `ml`.
- [x] Data loaded by Simon (`load.sql`). Remote counts match the local run (2,000 customers, 427,265 transactions, 214,141 app events). Via the publishable key, only the 6 demo personas are visible, `ml` is not exposed (PGRST106) and writes are refused (401).
- [ ] ML: clustering → personas, life-moment detection (see `prediction-model.md`)
