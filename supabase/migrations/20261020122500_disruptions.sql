-- T6 — Disruption types and replanning strategies (pipeline stage ⑪).
-- Config tables: the engine reads them (or their snapshot) to know what a disruption
-- breaks and which strategies may repair it. See backend/T6-disruption-replan.md.

create table public.disruption_types (
  code          text primary key check (code ~ '^[A-Z_]+$'),
  signals       text[] not null default '{}',   -- SignalCode[] that reveal it
  affects       text[] not null default '{}',   -- keyof GoalConstraints it can break
  kate_template text   not null                 -- {firstName}, {goal}, {delta} placeholders
);

create table public.replan_strategies (
  code       text primary key check (code ~ '^[A-Z_]+$'),
  applies_to text[] not null default '{}',      -- DisruptionCode[]
  params     jsonb  not null default '{}'::jsonb
);

comment on table public.disruption_types is 'T6: what each disruption is detected from and which goal constraints it can break.';
comment on table public.replan_strategies is 'T6: replanning strategies, the disruptions they apply to, and their tuning params.';

-- Read-only config: anyone can read, nobody writes through the API.
alter table public.disruption_types enable row level security;
alter table public.replan_strategies enable row level security;

create policy "config is readable" on public.disruption_types
  for select to anon, authenticated using (true);
create policy "config is readable" on public.replan_strategies
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.disruption_types, public.replan_strategies
  from anon, authenticated;

insert into public.disruption_types (code, signals, affects, kate_template) values
  ('INCOME_DROP', '{INCOME_DROP,BENEFITS_INFLOW}', '{maxMonthlyPayment,budget}',
   '{firstName}, your income has changed, and your {goal} plan is now above what you can comfortably repay. I''ve prepared two options.'),
  ('COST_OVERRUN', '{COST_OVERRUN}', '{budget}',
   '{firstName}, a quote came in {delta} above the estimate, so your {goal} plan no longer fits the budget. Here are two ways to absorb it.'),
  ('PARTNER_DELAY', '{PARTNER_DELAY}', '{deadline}',
   '{firstName}, one of the partners in your {goal} plan is running late ({delta}). I''ve prepared two ways to keep you on schedule.'),
  ('UNEXPECTED_EXPENSE', '{LARGE_UNEXPECTED_EXPENSE}', '{ownFunds}',
   '{firstName}, a large expense reduced your savings by {delta}. Your {goal} plan needs a small adjustment. Here are two options.'),
  ('RATE_CHANGE', '{RATE_CHANGE}', '{maxMonthlyPayment}',
   '{firstName}, interest rates moved ({delta}), which changes your monthly payment. Here are two options to stay comfortable.');

insert into public.replan_strategies (code, applies_to, params) values
  ('REDUCE_SCOPE', '{INCOME_DROP,COST_OVERRUN,UNEXPECTED_EXPENSE,RATE_CHANGE}',
   '{"phaseLater": ["evaluate_solar", "quote_windows"], "paymentMargin": 0.95, "roundTo": 5000}'),
  ('EXTEND_TERM', '{INCOME_DROP,RATE_CHANGE,COST_OVERRUN}',
   '{"maxTermYears": 30}'),
  ('SWAP_PROVIDER', '{PARTNER_DELAY,COST_OVERRUN}',
   '{}'),
  ('REORDER', '{PARTNER_DELAY}',
   '{}'),
  ('ADD_PROTECTION', '{INCOME_DROP}',
   '{"always": ["insure_loan"], "selfEmployed": ["insure_income"], "combineWith": ["EXTEND_TERM"]}'),
  ('MAXIMISE_GRANTS', '{COST_OVERRUN,UNEXPECTED_EXPENSE}',
   '{"capability": "identify_grants"}'),
  ('PAUSE', '{INCOME_DROP,COST_OVERRUN,PARTNER_DELAY,UNEXPECTED_EXPENSE,RATE_CHANGE}',
   '{"followUpDays": 30}');
