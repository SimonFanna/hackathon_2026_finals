-- T5 · ⑧ Decision & suppression rules, applied to every plan step after planning.
-- Each condition is a JSON `Condition` (web/src/backend/types.ts) evaluated against
-- { ctx, step, fb }: step.held / step.commercial / step.optional and fb.*DaysAgo are derived by
-- web/src/backend/engine/rules.ts. Highest priority wins; LOWER_PRIORITY only moves the step later.
-- Mirror of web/src/backend/fixtures/t5-inputs.ts `decisionRules` (offline fallback).

create table if not exists public.decision_rules (
  id text primary key,
  condition jsonb not null,
  effect text not null check (effect in ('SHOW_STEP', 'SHOW_GUIDANCE', 'SHOW_PARTNER', 'ALREADY_COVERED', 'WAIT', 'HIDDEN', 'LOWER_PRIORITY')),
  priority integer not null,
  reason text not null
);

comment on table public.decision_rules is 'T5: suppression rules on plan steps (already held, cashflow pressure, feedback, partner consent, guidance).';

-- Config table: readable by the app, written only through migrations / the secret key.
alter table public.decision_rules enable row level security;

create policy "decision rules are readable" on public.decision_rules
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.decision_rules from anon, authenticated;

insert into public.decision_rules (id, condition, effect, priority, reason) values
  ('already_held', '{"field":"step.held","op":"eq","value":true}'::jsonb, 'ALREADY_COVERED', 100, 'You already have this with KBC.'),
  ('not_relevant_90d', '{"field":"fb.notRelevantDaysAgo","op":"lte","value":90}'::jsonb, 'HIDDEN', 90, 'You told us this wasn''t relevant.'),
  ('cashflow_wait', '{"all":[{"field":"ctx.cashflowPressure","op":"eq","value":"high"},{"field":"step.commercial","op":"eq","value":true},{"any":[{"field":"step.optional","op":"eq","value":true},{"field":"step.capability","op":"in","value":["evaluate_solar","quote_windows","build_pension","accept_payments"]}]}]}'::jsonb, 'WAIT', 80, 'Paused while your finances settle.'),
  ('not_now_30d', '{"field":"fb.notNowDaysAgo","op":"lte","value":30}'::jsonb, 'LOWER_PRIORITY', 70, 'You asked us to come back to this later.'),
  ('partner_consent', '{"field":"step.provider.isPartner","op":"eq","value":true}'::jsonb, 'SHOW_PARTNER', 50, 'Shared only with your consent.'),
  ('advice_only', '{"field":"step.capability","op":"in","value":["estimate_budget","get_startup_support","get_tax_legal_advice","connect_accountant"]}'::jsonb, 'SHOW_GUIDANCE', 40, 'Free guidance, no product to buy.')
on conflict (id) do update set
  condition = excluded.condition, effect = excluded.effect, priority = excluded.priority, reason = excluded.reason;
