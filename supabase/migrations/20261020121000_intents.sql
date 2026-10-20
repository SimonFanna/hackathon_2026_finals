-- T3: moments, intents and decision-gate config (backend/T3-moments-intents-decision.md).
-- Config tables: RLS on, readable by anon/authenticated, writes revoked (same pattern as the catalogue).
-- The seed mirrors web/src/backend/fixtures/t3-rules.ts (a test checks they stay in sync).

create table public.moment_rules (
  moment            text primary key check (moment in ('HOME_BUYING','STARTING_BUSINESS','NEW_PARENT','EV_PURCHASE','RETIREMENT_PREP','CASHFLOW_PRESSURE')),
  label             text not null,
  weights           jsonb not null default '{}'::jsonb check (jsonb_typeof(weights) = 'object'),   -- SignalCode -> weight
  bias              numeric not null,
  context_condition jsonb,                                                                         -- Condition gate, null = always
  context_scores    jsonb not null default '[]'::jsonb check (jsonb_typeof(context_scores) = 'array'), -- [{condition, score, label}]
  requires_signal   boolean not null default true,
  expiry_days       integer not null check (expiry_days > 0)
);

create table public.intents (
  code              text primary key,
  label             text not null,
  goal_type         text check (goal_type in ('BUY_AND_PREPARE_HOME','START_BUSINESS','WELCOME_BABY','SWITCH_TO_EV','PREPARE_RETIREMENT')),
  ask_threshold     numeric not null check (ask_threshold between 0 and 1),
  suggest_threshold numeric not null check (suggest_threshold between 0 and 1),
  is_commercial     boolean not null default true,
  kate_ask          text not null,    -- template: {firstName}, {evidence}
  kate_suggest      text not null,
  check (ask_threshold <= suggest_threshold)
);

create table public.intent_rules (
  id        bigint generated always as identity primary key,
  moment    text not null references public.moment_rules (moment),
  intent    text not null references public.intents (code),
  weight    numeric not null check (weight > 0 and weight <= 1),
  condition jsonb               -- evaluated against { ctx, moment }
);
create index intent_rules_moment_idx on public.intent_rules (moment);
create index intent_rules_intent_idx on public.intent_rules (intent);

alter table public.moment_rules enable row level security;
alter table public.intents enable row level security;
alter table public.intent_rules enable row level security;

create policy "config is readable" on public.moment_rules
  for select to anon, authenticated using (true);
create policy "config is readable" on public.intents
  for select to anon, authenticated using (true);
create policy "config is readable" on public.intent_rules
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.moment_rules, public.intents, public.intent_rules
  from anon, authenticated;

-- ===== Seed =====
insert into public.moment_rules (moment, label, weights, bias, context_condition, context_scores, requires_signal, expiry_days) values
  ('HOME_BUYING', 'buying a home', '{"MORTGAGE_SIMULATION":6,"HOME_LOAN_APPLICATION":6,"NOTARY_PAYMENT":6,"HOME_LOAN_KATE_QUESTION":4,"HOUSING_BUDGET_VIEW":3,"PROPERTY_VALUATION_VIEW":3,"HOME_SEARCH_IN_APP":3,"SAVING_FOR_DOWN_PAYMENT":2,"RENOVATION_VIEW":1.5}'::jsonb, -2.1, null, '[{"condition":{"field":"ctx.housing","op":"neq","value":"owner"},"score":0.2,"label":"You don''t own a home yet"}]'::jsonb, true, 180),
  ('STARTING_BUSINESS', 'starting your own business', '{"FREELANCE_INCOME":4,"START_IT_VIEW":4,"BUSINESS_KATE_QUESTION":4,"BUSINESS_ACCOUNT_VIEW":3,"ACCOUNTING_TOOL_PAYMENT":3,"SALARY_STOPPED":2,"EQUIPMENT_PURCHASE":1.5}'::jsonb, -2, '{"field":"ctx.employment","op":"neq","value":"retired"}'::jsonb, '[]'::jsonb, true, 180),
  ('NEW_PARENT', 'welcoming a baby', '{"CHILD_BORN":5,"BABY_SPENDING":2.5,"CHILDCARE_PAYMENT":2}'::jsonb, -2, null, '[]'::jsonb, true, 365),
  ('EV_PURCHASE', 'switching to an electric car', '{"EV_LOAN_SIMULATION":5,"EV_PAGE_VIEW":3,"CAR_LOAN_ENDING":2,"EV_CHARGING":1}'::jsonb, -2, null, '[]'::jsonb, true, 120),
  ('RETIREMENT_PREP', 'preparing for retirement', '{"PENSION_VIEW":3,"LUMP_SUM_INVESTMENT":2}'::jsonb, -2, '{"field":"ctx.age","op":"gte","value":45}'::jsonb, '[]'::jsonb, true, 365),
  ('CASHFLOW_PRESSURE', 'a tighter budget', '{"INCOME_DROP":5,"SALARY_STOPPED":1.5,"LARGE_UNEXPECTED_EXPENSE":3,"BENEFITS_INFLOW":0.5}'::jsonb, -2, null, '[{"condition":{"field":"ctx.cashflowPressure","value":"high"},"score":3.5,"label":"Your fixed costs take a large share of your income"},{"condition":{"field":"ctx.cashflowPressure","value":"medium"},"score":1.5,"label":"Your fixed costs are rising compared to your income"}]'::jsonb, false, 90);

insert into public.intents (code, label, goal_type, ask_threshold, suggest_threshold, is_commercial, kate_ask, kate_suggest) values
  ('BUY_HOME', 'Buy a home', 'BUY_AND_PREPARE_HOME', 0.5, 0.85, true, 'Hi {firstName} 👋 I noticed you''ve been looking at home loans lately. Are you planning to buy a home? I can put together your complete plan, from budget to keys.', 'Hi {firstName} 👋 It looks like you''re getting ready to buy a home ({evidence}). Shall I build your complete plan, from budget and loan to inspection, renovation and insurance?'),
  ('RENOVATE_HOME', 'Renovate a home', null, 0.5, 0.85, true, 'Hi {firstName} 👋 You''ve been checking renovation costs and grants. Are you planning to renovate? I can tell you which grants apply and who can quote.', 'Hi {firstName} 👋 Want me to line up the renovation: costs, grants, quotes and financing in one plan?'),
  ('REDUCE_ENERGY_COST', 'Lower energy costs', null, 0.5, 0.85, false, 'Hi {firstName} 👋 Would you like to see how much you could save on energy with insulation, a heat pump or solar panels?', 'Hi {firstName} 👋 I can show you the energy upgrades with the best payback for your home, including grants.'),
  ('START_BUSINESS', 'Start a business', 'START_BUSINESS', 0.5, 0.85, true, 'Hi {firstName} 👋 I see you''ve been exploring Start it @KBC and business topics. Are you thinking of starting your own business? I can set up everything you need, step by step.', 'Hi {firstName} 👋 It looks like you''re launching as a freelancer ({evidence}). Shall I prepare your start-up plan: business account, invoicing, payments, accountant and protection?'),
  ('PREPARE_FOR_BABY', 'Prepare for a baby', 'WELCOME_BABY', 0.5, 0.85, false, 'Hi {firstName} 👋 Congratulations if there''s a little one on the way or just arrived! Would you like a checklist for insurance, savings and child benefits?', 'Hi {firstName} 👋 I can make sure your little one is covered: insurance, child benefits and a savings plan, in one go.'),
  ('SWITCH_TO_EV', 'Switch to an electric car', 'SWITCH_TO_EV', 0.5, 0.85, true, 'Hi {firstName} 👋 You''ve been looking at electric cars. Are you thinking of switching? I can plan the loan, insurance and a home charger together.', 'Hi {firstName} 👋 Shall I put your EV switch in one plan: loan, insurance, charger and energy contract?'),
  ('PREPARE_RETIREMENT', 'Prepare for retirement', 'PREPARE_RETIREMENT', 0.5, 0.85, true, 'Hi {firstName} 👋 You''ve been looking at pension savings. Would you like to see where you stand for your retirement?', 'Hi {firstName} 👋 I can build your retirement plan: pension savings, tax benefits and investments, at your pace.');

insert into public.intent_rules (moment, intent, weight, condition) values
  ('HOME_BUYING', 'BUY_HOME', 1, null),
  ('HOME_BUYING', 'RENOVATE_HOME', 0.5, null),
  ('HOME_BUYING', 'RENOVATE_HOME', 0.7, '{"field":"moment.evidence","op":"contains","value":"RENOVATION_VIEW"}'::jsonb),
  ('HOME_BUYING', 'REDUCE_ENERGY_COST', 0.4, null),
  ('STARTING_BUSINESS', 'START_BUSINESS', 1, null),
  ('NEW_PARENT', 'PREPARE_FOR_BABY', 1, null),
  ('EV_PURCHASE', 'SWITCH_TO_EV', 1, null),
  ('RETIREMENT_PREP', 'PREPARE_RETIREMENT', 1, null);
