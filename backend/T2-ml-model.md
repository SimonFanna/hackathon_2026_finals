# T2 — ML confidence model

> Owner: **Simon** · Status: todo · Last update: 11:00 · Pipeline stage ③ (moment confidence)
> Read first: `backend/TASKS.md`, `docs/features/prediction-model.md`, `docs/features/bank-data.md`.

## Goal

Learn, from the 2,000 synthetic customers, **how confident we are that a customer is in a life moment**. One explainable logistic regression per moment.

The engine uses the weights to produce `confidence` and **per-feature contributions**, which become Kate's "why am I seeing this?". T3 falls back to hand-written rules if no weights exist, so this task never blocks the demo.

## The key rule: one feature definition

Training and serving must compute **exactly the same features**. So the features are computed **in TypeScript, once**, from T1's signals and context:

```ts
// engine/features.ts
export function features(signals: Signal[], ctx: PersistentContext): Record<string, number>;
// engine/model.ts
export function predict(moment: MomentCode, x: Record<string, number>, weights: ModelWeight[]): Prediction | null; // null = no model for this moment
```

- **Features:** for every `SignalCode`, a value `sig_<CODE>` = signal strength (0 if absent), plus `cnt_<CODE>` = log1p(count) for the main ones. Context: `age_band_*` (one-hot), `is_tenant`, `is_owner`, `household_couple`, `children`, `segment_*`, `savings_k = savings/1000` (capped), `debt_ratio`.
- **`predict`:** `confidence = sigmoid(bias + Σ wᵢ·xᵢ)`. `contributions` = the top 5 `wᵢ·xᵢ` that are > 0, each with a human label (take the signal's `label` from `signal_rules`, or a label map for context features). `modelVersion` comes from the weights.

## Training pipeline (`scripts/ml/`)

1. **`export_features.ts`** (run with `npx tsx`): for every customer, load facts (T7's loader, or a direct SQL dump), call `toEvents → extractSignals → buildContext → features`, and write `scripts/ml/out/features.csv` with the label columns from `ml.customer_truth` (`life_moment`, `moment_started_on`). Use the secret key / `DATABASE_URL` from env only. `out/` is git-ignored.
   - Until T1 is ready, write a temporary feature export in SQL (counts per app-event item and tx category). Switch to the TS path at integration.
2. **`train.py`** (scikit-learn): one `LogisticRegression` per moment, labels from the `life_moment` mapping (`TASKS.md` §5).
   - Use `class_weight="balanced"`, 5-fold CV, and report **AUC and AP per moment**.
   - Keep regularisation modest so the weights stay readable.
   - Output `web/src/backend/engine/weights.json` (offline fallback, committed) and insert the rows into `model_weights`.
3. **`benchmark.ts`**: score 2.5M synthetic feature vectors in memory and print the time. Use the number in the pitch ("scores KBC's whole base in N seconds").

Be honest in the doc: on synthetic data the model mostly re-learns the generator. The value is the pipeline + explainability + the feedback loop (Kate's yes / no answers become new labels).

## Database: `supabase/migrations/20261020120500_model_weights.sql`

Create `model_weights`:

| Column | Type |
|---|---|
| `model_version` | text |
| `moment` | text |
| `feature` | text, includes `__bias__` |
| `weight` | numeric |
| `trained_at` | timestamptz |
| `auc` | numeric |
| `ap` | numeric |

Primary key `(model_version, moment, feature)`. Config-table RLS pattern.

Also create `model_metrics(model_version, moment, auc, ap, n_pos, n_neg)` for the "tech" slide.

## Fixtures

- Until weights exist, commit a tiny `weights.json` with hand-set weights for `HOME_BUYING`, so T3 can test the `ml` path right away (by 11:45).

## Steps

- [ ] Migration `model_weights` + `model_metrics`
- [ ] `features.ts` + tests (stable keys, no NaN, same output for the same input)
- [ ] `model.ts` `predict()` + tests (sigmoid, contributions sorted, null when no weights)
- [ ] Temporary SQL feature export → first training run → first `weights.json`
- [ ] Switch the export to the TS feature path (after T1) → retrain → weights in DB + JSON
- [ ] Metrics per moment in `model_metrics` + in this doc
- [ ] 2.5M benchmark script + number in `SOLUTION.md`
- [ ] Doc: update status + `prediction-model.md`

## Acceptance

- AUC is reported per moment.
- Sofie: `HOME_BUYING` confidence ≥ 0.6 with `MORTGAGE_SIMULATION` among the top contributions.
- Thomas (hard negative): `HOME_BUYING` clearly lower than Sofie's.
- Els: every moment < 0.3.
- `predict` runs in < 5 µs per call (scale story).

## Improvement ideas

- Model B, P(step accepted), to order plan steps (`prediction-model.md` §2): only if everything else is done.
- Calibration plot (reliability curve) for the pitch.
