-- T7 — Runtime state written by the backend (backend/T7-data-pipeline-api.md).
-- Each row keeps the engine object as a jsonb `payload` (same shape as the TS type in
-- web/src/backend/types.ts), plus the few columns we filter on.
-- Access: RLS on and NO policy, and every privilege revoked from anon / authenticated:
-- only the server, with the secret key, reads and writes these tables.

-- Demo / partner events injected on top of the bank facts (TS `Event`).
create table public.injected_events (
  id text primary key,
  customer_id bigint not null references public.customers (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index injected_events_customer_id_idx on public.injected_events (customer_id);

-- Latest pipeline output per customer (TS `Signal`, `Intent`), overwritten at each run.
create table public.signals (
  customer_id bigint not null references public.customers (id) on delete cascade,
  code text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (customer_id, code)
);

create table public.customer_intents (
  customer_id bigint not null references public.customers (id) on delete cascade,
  intent text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (customer_id, intent)
);

create table public.goals (
  id text primary key,                                  -- engine id, e.g. goal-1-buy_and_prepare_home
  customer_id bigint not null references public.customers (id) on delete cascade,
  payload jsonb not null,                               -- TS `Goal`
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_customer_id_idx on public.goals (customer_id);

-- Every plan version is kept (initial, replan, scenario).
create table public.plans (
  id text primary key,                                  -- engine id, e.g. goal-1-…:v2
  goal_id text not null references public.goals (id) on delete cascade,
  version int not null check (version > 0),
  reason text not null check (reason in ('initial', 'replan', 'scenario')),
  payload jsonb not null,                               -- TS `Plan`
  created_at timestamptz not null default now(),
  unique (goal_id, version)
);

create table public.scenarios (
  id text primary key,
  goal_id text not null references public.goals (id) on delete cascade,
  payload jsonb not null,                               -- TS `Scenario`
  created_at timestamptz not null default now()
);
create index scenarios_goal_id_idx on public.scenarios (goal_id);

-- Append-only consent ledger (TS `Consent`); the latest row per (step, partner, field) wins.
create table public.consents (
  id bigint generated always as identity primary key,
  goal_id text not null references public.goals (id) on delete cascade,
  step_id text not null,
  partner text not null,
  field text not null,
  granted boolean not null,
  at timestamptz not null default now()
);
create index consents_goal_id_idx on public.consents (goal_id);

create table public.kate_messages (
  id text primary key,
  customer_id bigint not null references public.customers (id) on delete cascade,
  payload jsonb not null,                               -- TS `KateMessage`
  created_at timestamptz not null default now()
);
create index kate_messages_customer_id_idx on public.kate_messages (customer_id);

create table public.feedback (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id) on delete cascade,
  target text not null,                                 -- intent or capability code
  kind text not null check (kind in ('yes', 'not_now', 'no', 'not_relevant')),
  at timestamptz not null default now()
);
create index feedback_customer_id_idx on public.feedback (customer_id);

-- Latest outcome per goal (TS `Outcome`).
create table public.outcomes (
  goal_id text primary key references public.goals (id) on delete cascade,
  payload jsonb not null,
  computed_at timestamptz not null default now()
);

alter table public.injected_events enable row level security;
alter table public.signals enable row level security;
alter table public.customer_intents enable row level security;
alter table public.goals enable row level security;
alter table public.plans enable row level security;
alter table public.scenarios enable row level security;
alter table public.consents enable row level security;
alter table public.kate_messages enable row level security;
alter table public.feedback enable row level security;
alter table public.outcomes enable row level security;

revoke all on
  public.injected_events, public.signals, public.customer_intents, public.goals, public.plans,
  public.scenarios, public.consents, public.kate_messages, public.feedback, public.outcomes
  from anon, authenticated;
