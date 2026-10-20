-- T2 · model_weights + model_metrics: the trained moment-confidence models (backend/T2-ml-model.md).
-- Rows are produced by scripts/ml/train.py → supabase/seed/model_weights.sql (re-runnable).
-- The engine reads them as ModelWeight[] (web/src/backend/types.ts); `__bias__` is the intercept.

create table public.model_weights (
  model_version text not null,
  moment text not null,
  feature text not null,
  weight numeric not null,
  trained_at timestamptz not null default now(),
  auc numeric check (auc between 0 and 1),
  ap numeric check (ap between 0 and 1),
  primary key (model_version, moment, feature)
);

-- One row per model and moment, for the "tech" slide (cross-validated, out-of-fold).
create table public.model_metrics (
  model_version text not null,
  moment text not null,
  auc numeric not null check (auc between 0 and 1),
  ap numeric not null check (ap between 0 and 1),
  n_pos int not null check (n_pos >= 0),
  n_neg int not null check (n_neg >= 0),
  primary key (model_version, moment)
);

-- Config tables: readable by everyone (non-sensitive), written only through migrations / seeds.
alter table public.model_weights enable row level security;
alter table public.model_metrics enable row level security;
create policy "model weights are readable" on public.model_weights for select to anon, authenticated using (true);
create policy "model metrics are readable" on public.model_metrics for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.model_weights, public.model_metrics from anon, authenticated;
