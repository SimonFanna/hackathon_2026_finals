# Feature — T4 Capability registry & goal templates
> Owner: Simon (Claude session `simon-data`) · Status: in progress · Last update: 11:30

## Goal
Turn the 229-item KBC catalogue into **capabilities** (what can be done) with **providers** (KBC or partner catalogue items), and describe each goal as an ordered **template** of capabilities. A new goal = new rows, zero code. Spec: `backend/T4-capability-registry.md`.

## How it works
- **Data, single source of truth:** `web/src/backend/fixtures/t4-rules.ts` (24 capabilities, 36 providers, 2 templates / 24 steps). Item names and partners are copied from the catalogue; `registry.test.ts` checks every one against `web/src/backend/data/snapshot/catalogue.json`.
- **Database:** `supabase/migrations/20261020121500_capabilities.sql` (`capabilities`, `capability_providers`, `goal_templates`, `template_steps`; config RLS: public read, no API writes). Applied on `endbafjcxanzmlwiezwe`.
- **Seed:** `node scripts/registry/seed.ts` regenerates `supabase/seed/capabilities.sql` from the TS data (one transaction, replaces all registry rows). Applied.
- **Lookup:** `web/src/backend/engine/registry.ts` — `getTemplate`, `providersFor` (priority desc, then catalogue row), `capability`, `coverageReport`, `validateRegistry` (unknown codes, steps without provider, dependencies outside the template, cycles, rows missing from the catalogue).
- **Catalogue JSON:** `python3 scripts/import_catalog.py` now also writes `web/src/backend/data/snapshot/catalogue.json` (offline copy used by tests and the snapshot).

## Decisions (and why)
- **Provider names come from the catalogue**, not invented: a row without a partner suffix is a KBC item. So Bancontact Pro rows are KBC items (Bancontact is not a listed partner), and `Business Account - Partner Hub` is KBC via the Partner Hub channel.
- **Seed generated from TS**, not hand-written twice: T5/T6 fixtures and the DB cannot drift.
- `capability_providers` stores no names: the backend joins `source_row` → `ecosystem_items` / `partners`.
- `finance_property` has no "not a cash buyer" condition: a Condition cannot compare two fields; T5 decides from the budget.

## Coverage
**35 of the 229 catalogue items** are wired as providers (36 provider rows; Setle row 12 serves two capabilities).

## Known limits / improvement ideas
- Stretch templates (`WELCOME_BABY`, `SWITCH_TO_EV`, `PREPARE_RETIREMENT`) need new capability codes in `vocabulary.ts`.
- Estimates are illustrative (see `docs/assumptions.md`).

## Status checklist
- [x] Fixture `t4-rules.ts`
- [x] Migration + seed applied, advisors clean (only the expected INFO on `ml.customer_truth`)
- [x] `registry.ts` + tests (unknown goal throws, providers sorted, every step has a provider, no cycle, rows exist)
- [x] `coverageReport`
- [ ] Coverage number in `SOLUTION.md`
- [ ] Stretch templates
