-- KBC capability catalogue, imported from resources/KBC_Ecosystems.xlsx.
-- Faithful to the source: every row keeps its original label (raw_label) and
-- its row number in the sheet (source_row). The only parsing is splitting the
-- "<item> - <Partner>" suffix; "Partner Hub" is a channel, not a partner.

create table public.ecosystems (
  id bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  position int not null
);

create table public.partners (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.ecosystem_items (
  id bigint generated always as identity primary key,
  ecosystem_id bigint not null references public.ecosystems (id),
  partner_id bigint references public.partners (id),
  name text not null,
  raw_label text not null,
  via_partner_hub boolean not null default false,
  source_row int not null unique
);

create index ecosystem_items_ecosystem_id_idx on public.ecosystem_items (ecosystem_id);
create index ecosystem_items_partner_id_idx on public.ecosystem_items (partner_id);

-- The catalogue is public, read-only reference data: anyone can read it,
-- nobody can write through the API (writes go through migrations / the secret key).
alter table public.ecosystems enable row level security;
alter table public.partners enable row level security;
alter table public.ecosystem_items enable row level security;

create policy "catalogue is readable" on public.ecosystems
  for select to anon, authenticated using (true);
create policy "catalogue is readable" on public.partners
  for select to anon, authenticated using (true);
create policy "catalogue is readable" on public.ecosystem_items
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.ecosystems, public.partners, public.ecosystem_items
  from anon, authenticated;
