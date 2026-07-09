-- Phase F patch: Lead-to-Deal data model + enforcement, Contacts many-to-many,
-- deal-creation lockdown, deal stage consolidation, Closed Won -> Project
-- handover, and a single Product catalog.
--
-- Run AFTER phase-e-workflow-enhancements-patch.sql (independent of it, but
-- keeping the same run order as they were written). Idempotent except where
-- noted — the two hard constraints (company domain uniqueness, contacts
-- required fields) will abort with a clear error if existing data violates
-- them; see the comments directly above each for how to check/fix first.

-- ---------------------------------------------------------------------------
-- 1. COMPANY — unique by normalized website domain (hard block)
-- ---------------------------------------------------------------------------

create or replace function normalize_domain(input text) returns text as $$
  select case when input is null or trim(input) = '' then null else
    lower(regexp_replace(regexp_replace(regexp_replace(trim(input), '^https?://', ''), '^www\.', ''), '/.*$', ''))
  end;
$$ language sql immutable;

alter table accounts add column if not exists domain_normalized text generated always as (normalize_domain(domain)) stored;

-- If this fails with a unique_violation, existing companies already share a
-- domain. Find them and clean up with merge_accounts() (added in phase-e)
-- before re-running:
--   select domain_normalized, array_agg(id) from accounts
--   where domain_normalized is not null group by domain_normalized having count(*) > 1;
do $$
begin
  create unique index accounts_domain_normalized_uidx on accounts(domain_normalized) where domain_normalized is not null;
exception when unique_violation then
  raise exception 'Duplicate company domains exist. Resolve with merge_accounts() (see query in this file''s comments), then re-run this migration.';
end $$;

-- ---------------------------------------------------------------------------
-- 2. LEAD <-> CONTACT many-to-many (replaces the single contacts.lead_id for
-- new associations; the old column is left in place, unused, for backward
-- read-compatibility with any historical data/reports).
-- ---------------------------------------------------------------------------

create table if not exists lead_contacts (
  lead_id uuid not null references leads(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, contact_id)
);
create index if not exists lead_contacts_contact_id_idx on lead_contacts(contact_id);

insert into lead_contacts (lead_id, contact_id)
select lead_id, id from contacts where lead_id is not null
on conflict do nothing;

alter table lead_contacts enable row level security;

drop policy if exists "lead_contacts_select" on lead_contacts;
create policy "lead_contacts_select" on lead_contacts for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

drop policy if exists "lead_contacts_insert" on lead_contacts;
create policy "lead_contacts_insert" on lead_contacts for insert to authenticated
  with check (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

drop policy if exists "lead_contacts_delete" on lead_contacts;
create policy "lead_contacts_delete" on lead_contacts for delete to authenticated
  using (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 3. CONTACTS — Company and Contact Owner become required (data-layer, not
-- just UI). owner_id is backfilled to an admin where missing so this never
-- fails; account_id has no safe default — if this fails, some contacts have
-- no company and must be assigned one manually first:
--   select id, first_name, last_name, email from contacts where account_id is null;
-- ---------------------------------------------------------------------------

update contacts set owner_id = (select id from profiles where role = 'ADMIN' order by created_at limit 1)
where owner_id is null;

alter table contacts alter column owner_id set not null;
alter table contacts alter column account_id set not null;

-- ---------------------------------------------------------------------------
-- 4. DEAL STAGES — consolidate to Discovery / SQL / Closed Won / Closed Lost.
-- "SQL" absorbs the old Product Demo / Proposal Sent / Negotiation stages.
-- ---------------------------------------------------------------------------

update deal_stages set name = 'SQL', "order" = 2, win_probability = 60 where name = 'Negotiation';
update deal_stages set win_probability = 20 where name = 'Discovery';
update deal_stages set win_probability = 100 where name = 'Closed Won';
update deal_stages set win_probability = 0 where name = 'Closed Lost';

update opportunities o set stage_id = sql_stage.id
from deal_stages sql_stage
where sql_stage.name = 'SQL' and sql_stage.pipeline_id = o.pipeline_id
  and o.stage_id in (
    select id from deal_stages ds where ds.name in ('Product Demo', 'Proposal Sent') and ds.pipeline_id = o.pipeline_id
  );

delete from deal_stages where name in ('Product Demo', 'Proposal Sent');

update deal_stages set "order" = 3 where name = 'Closed Won';
update deal_stages set "order" = 4 where name = 'Closed Lost';

-- ---------------------------------------------------------------------------
-- 5. DEAL CREATION LOCKDOWN — a Deal can only be inserted by converting a
-- Qualified (is_won) lead. Bypassed only when auth.uid() is null (trusted
-- server-side inserts — service-role edge functions, seed scripts); every
-- normal authenticated client insert must carry a lead_id pointing at a
-- Qualified lead. This is the DB-level backstop behind removing every "New
-- Deal" UI entry point — it can't be bypassed via devtools/direct API calls.
-- ---------------------------------------------------------------------------

create or replace function guard_deal_creation() returns trigger as $$
declare
  lead_is_won boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.lead_id is null then
    raise exception 'Deals can only be created by converting a Qualified lead.';
  end if;
  select ls.is_won into lead_is_won from leads l join lead_stages ls on ls.id = l.stage_id where l.id = new.lead_id;
  if not coalesce(lead_is_won, false) then
    raise exception 'Deals can only be created by converting a Qualified lead.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists opportunities_guard_creation on opportunities;
create trigger opportunities_guard_creation
  before insert on opportunities
  for each row execute function guard_deal_creation();

-- ---------------------------------------------------------------------------
-- 6. CLOSED WON -> PROJECT HANDOVER — automatic, event-driven. A project
-- needs a company context (name/value/contacts all read through it), so no
-- project is created for a deal with no linked account.
-- ---------------------------------------------------------------------------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  opportunity_id uuid not null unique references opportunities(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  value numeric(15, 2),
  status varchar(30) not null default 'HANDOVER_PENDING',
  created_at timestamptz not null default now()
);
create index if not exists projects_account_id_idx on projects(account_id);

alter table projects enable row level security;

drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = projects.opportunity_id and o.owner_id = auth.uid())
  );
-- No client insert/update/delete policy — projects are created exclusively
-- by the trigger below (security definer, bypasses RLS for its own insert).

create or replace function create_project_on_closed_won() returns trigger as $$
declare
  won boolean;
begin
  select is_closed_won into won from deal_stages where id = new.stage_id;
  if not coalesce(won, false) or new.account_id is null then
    return new;
  end if;
  insert into projects (name, opportunity_id, account_id, value)
  values (new.name, new.id, new.account_id, new.amount)
  on conflict (opportunity_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists opportunities_create_project_ins on opportunities;
create trigger opportunities_create_project_ins
  after insert on opportunities
  for each row execute function create_project_on_closed_won();

drop trigger if exists opportunities_create_project_upd on opportunities;
create trigger opportunities_create_project_upd
  after update on opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function create_project_on_closed_won();

-- ---------------------------------------------------------------------------
-- 7. PRODUCT CATALOG — single list, Sector attribute (Private / Government /
-- Both) drives filtering rather than forking into separate catalogs.
-- ---------------------------------------------------------------------------

do $$ begin
  create type product_sector as enum ('PRIVATE', 'GOVERNMENT', 'BOTH');
exception when duplicate_object then null; end $$;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  sku varchar(80) unique,
  category varchar(120),
  sector product_sector not null default 'BOTH',
  unit_price numeric(15, 2) not null default 0 check (unit_price >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_sector_idx on products(sector);
drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

alter table products enable row level security;

drop policy if exists "products_select_all" on products;
create policy "products_select_all" on products for select to authenticated using (true);

drop policy if exists "products_write_managers" on products;
create policy "products_write_managers" on products for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

alter table deal_line_items add column if not exists product_id uuid references products(id) on delete set null;
