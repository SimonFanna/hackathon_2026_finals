# Feature — Supabase live data (demo customer + signals)
> Owner: kepa (coordinator session) · Status: done · Last update: 11:10

## Goal
The demo reads Sofie and her signals from the Supabase synthetic bank (`docs/features/bank-data.md`) instead of invented static data. Supabase is the only source of truth; the offline fallback is an exact copy of the same rows.

## How it works (files, data, contracts/APIs)
| File | Role |
|---|---|
| `web/src/engine/bank.ts` | Pure `mapBankProfile(customerRow, appEvents, today)` → `{ customer, signals }`. Unit-tested in `bank.test.ts`. |
| `web/src/engine/bankSnapshot.ts` | Offline snapshot of Sofie's rows (customer id 1 + the 19 events that can map to a signal), taken 2026-10-20. `demoCustomer` / `demoSignals` in `data.ts` are derived from it with the same mapper. |
| `web/src/lib/bankClient.ts` | `fetchDemoProfile(slug)`: 2 GET calls to the Data API (`customers?demo_slug=eq.sofie` with `customer_children(count)`, then `app_events` with `ecosystem_items(name)`), publishable key, 3 s timeout. Any failure → `null`. |
| `web/src/components/journey/Stage.tsx` | Starts on the snapshot, swaps to the live profile when the fetch succeeds. The presenter panel (key P) shows the source: "Live from Supabase" or "Offline snapshot". |

Event → signal mapping (one signal per group, weights in `data.ts`):
- `page_view`/`search` on "…property valuation…", "Search for a home", Immoscoop → `property_search` (0.35)
- `simulation` on "Home loan" → `mortgage_simulation` (0.40), carries `amountEur` of the latest simulation
- views of renovation / energy items → `renovation_research` (0.20, new type)
- Kate questions mentioning renovation, insulation, heat pump, EPC, energy loan → `renovation_research`

Sofie today: 3 valuation views, 4 home-loan simulations (latest **€251k**), 2 renovation-cost views, 1 Kate question → confidence 0.69 → ASK.

Text built from data: Kate's line (`kateLineFor` in `copy.ts`) and the budget step's "why" (`buildJourney(intent, customer, signals)`).

Env (`web/.env.local`, Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Without them the app runs on the snapshot.

## Decisions (and why)
- **Plain `fetch` to PostgREST, no `supabase-js`:** two read-only calls, no extra dependency, CSP already allows the project origin.
- **Snapshot from the same rows, same mapper:** the offline demo shows exactly what Supabase shows; no second story to keep in sync.
- **Publishable key in env, not in code:** it is public by design (RLS exposes only the 6 demo personas + catalogue), but keeping it out of git avoids secret-scanner noise in Aikido.
- **The weak scenario (key W)** keeps only `renovation_research` signals → 0.20 → NO ACTION.

## Known limits / improvement ideas
- Only Sofie is wired; the other demo personas (lucas, nadia, pieter, els, thomas) can be loaded with the same call (`fetchDemoProfile(slug)`), but they need their own intent/journey.
- Journey steps still come from `buyHouseSteps` in `data.ts`, not from `ecosystem_items`.
- The snapshot must be refreshed if Simon re-seeds with a different seed.
- Home-screen balances and transactions are still decor (could read `accounts` / `transactions`).

## Status checklist
- [x] Mapper + tests (`bank.test.ts`)
- [x] Snapshot = Supabase rows; demo data derived from it
- [x] Live fetch verified on a prod build (2 × 200, no CSP violation, no console error)
- [x] Offline fallback verified (Supabase blocked → "Offline snapshot", same signals)
- [ ] Add the 2 env vars in Vercel when the project is created
