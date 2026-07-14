-- ============================================================================
-- STEP 2 of 2 - run AFTER apply-pending-patches-1of2.sql has succeeded.
-- Concatenation of phase-e + phase-f + phase-g (minus the enum addition,
-- which lives in step 1). Idempotent; safe to re-run.
-- ============================================================================
-- Phase E patch: Lead-to-Deal workflow enhancements.
--   1. Leads: consolidate Phone/Mobile into a single "Mobile Number" field.
--   2. Lead stages: rename "Working" -> "Attempted Contact" to match the
--      HubSpot-inspired stage naming (New / Attempted Contact / Contacted /
--      Qualified / Unqualified).
--   3. MQL gate: an `icp_match` flag plus a trigger that blocks a lead from
--      entering a "won" (Qualified) stage unless ICP + Budget + Authority
--      are filled in — makes the qualification workflow unskippable from
--      any client, not just the UI.
--   4. Contacts: add mobile / department / notes columns for the new
--      standalone Contacts module.
--   5. merge_accounts(): admin/manager-only company-merge RPC.
--
-- Idempotent, run top-to-bottom in one pass (SQL Editor or
-- `supabase db push --linked --file`), same as phase-b/c/d.

-- ---------------------------------------------------------------------------
-- 1. LEADS — Mobile Number consolidation
-- ---------------------------------------------------------------------------

update leads set mobile = phone where mobile is null and phone is not null;

-- ---------------------------------------------------------------------------
-- 2. LEAD STAGES — rename to match the spec's stage list
-- ---------------------------------------------------------------------------

update lead_stages set name = 'Attempted Contact', "order" = 2 where name = 'Working';
update lead_stages set "order" = 3 where name = 'Contacted';

-- ---------------------------------------------------------------------------
-- 3. MQL GATE
-- ---------------------------------------------------------------------------

alter table leads add column if not exists icp_match boolean not null default false;

create or replace function guard_lead_qualification() returns trigger as $$
declare
  entering_won boolean;
  was_won boolean;
begin
  select is_won into entering_won from lead_stages where id = new.stage_id;
  select is_won into was_won from lead_stages where id = old.stage_id;
  if coalesce(entering_won, false) and not coalesce(was_won, false) then
    if not coalesce(new.icp_match, false) or new.budget_score is null or new.authority_score is null then
      raise exception 'Cannot mark this lead Qualified — ICP Match, Budget, and Authority must be confirmed first (MQL validation).';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_guard_qualification on leads;
create trigger leads_guard_qualification
  before update on leads
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function guard_lead_qualification();

-- ---------------------------------------------------------------------------
-- 4. CONTACTS — new fields for the standalone Contacts module
-- ---------------------------------------------------------------------------

alter table contacts
  add column if not exists mobile varchar(40) check (mobile is null or mobile ~ '^\+?[0-9]{10}$'),
  add column if not exists department varchar(120),
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 5. MERGE ACCOUNTS (companies) — admin/manager only. Repoints every
-- dependent row from source to target, then deletes the source account.
-- ---------------------------------------------------------------------------

create or replace function merge_accounts(source_id uuid, target_id uuid) returns void as $$
begin
  if not is_manager_or_admin() then
    raise exception 'Only an admin or sales manager can merge companies.';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a company into itself.';
  end if;

  update leads set account_id = target_id where account_id = source_id;
  update contacts set account_id = target_id where account_id = source_id;
  update opportunities set account_id = target_id where account_id = source_id;
  update opportunities set partner_account_id = target_id where partner_account_id = source_id;
  update tasks set account_id = target_id where account_id = source_id;
  update activities set account_id = target_id where account_id = source_id;
  update support_tickets set account_id = target_id where account_id = source_id;

  delete from accounts where id = source_id;
end;
$$ language plpgsql security definer set search_path = public;


-- ####################### PHASE F BEGINS #######################

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


-- ####################### PHASE G BEGINS #######################

-- Phase G patch: differentiator features.
--   1. Contact association roles on the Lead side (lead_contacts.role) +
--      an OTHER role option.
--   2. Deal forecast category (Commit / Best Case / Pipeline / Omitted),
--      separate from stage probability, with an override justification.
--   3. Versioned proposal/quote tracking per deal.
--   4. Engagement scoring: computed 0-100 score on leads AND deals,
--      recalculated by trigger whenever an activity is logged, decayed
--      nightly by pg_cron.
--   5. Activity-based stage advancement rules (config table; evaluation is
--      client-side so the rep gets a toast with Undo).
--   6. Post-sale client health fields on projects.
--   7. Renewal date + automated 30/7-day reminder tasks and at-risk flags.
--
-- IMPORTANT: the ALTER TYPE ... ADD VALUE below must commit before anything
-- references 'OTHER'. Run top-to-bottom in one pass (SQL Editor), same as
-- the phase-c/d/e/f patches. Idempotent throughout.


-- ---------------------------------------------------------------------------
-- 1. LEAD-SIDE CONTACT ROLES
-- ---------------------------------------------------------------------------

alter table lead_contacts add column if not exists role deal_contact_role not null default 'OTHER';

-- ---------------------------------------------------------------------------
-- 2. FORECAST CATEGORY
-- ---------------------------------------------------------------------------

do $$ begin
  create type forecast_category as enum ('COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITTED');
exception when duplicate_object then null; end $$;

-- null = derive from the deal's stage (Closed Won -> COMMIT, SQL -> BEST_CASE,
-- Discovery -> PIPELINE, Closed Lost -> OMITTED). A stored value is a manual
-- override; forecast_justification is required by the UI when the override is
-- more optimistic than the stage-derived default.
alter table opportunities
  add column if not exists forecast_category forecast_category,
  add column if not exists forecast_justification text;

-- ---------------------------------------------------------------------------
-- 3. PROPOSAL / QUOTE VERSIONS
-- ---------------------------------------------------------------------------

create table if not exists deal_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  version int not null,
  sent_date date not null,
  value numeric(15, 2) check (value is null or value >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (opportunity_id, version)
);
create index if not exists deal_proposals_opportunity_id_idx on deal_proposals(opportunity_id);

alter table deal_proposals enable row level security;

drop policy if exists "deal_proposals_select" on deal_proposals;
create policy "deal_proposals_select" on deal_proposals for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_proposals_insert" on deal_proposals;
create policy "deal_proposals_insert" on deal_proposals for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_proposals_update" on deal_proposals;
create policy "deal_proposals_update" on deal_proposals for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_proposals_delete" on deal_proposals;
create policy "deal_proposals_delete" on deal_proposals for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 4. ENGAGEMENT SCORING
-- ---------------------------------------------------------------------------

alter table opportunities
  add column if not exists score int not null default 0,
  add column if not exists last_activity_at timestamptz;

do $$ begin
  alter table opportunities add constraint opportunities_score_range check (score between 0 and 100);
exception when duplicate_object then null; end $$;

-- Engagement (up to 60 pts): weighted count of real interactions, capped.
-- Fit (up to 25 pts, leads only): ICP match + BANT sum.
-- Recency (up to 15 pts): full marks within 2 days, fading to 0 at 30 days.
create or replace function compute_lead_score(p_lead_id uuid) returns int as $$
declare
  engagement numeric;
  fit numeric;
  recency numeric;
  last_touch timestamptz;
  l record;
begin
  select * into l from leads where id = p_lead_id;
  if l is null then return 0; end if;

  select least(60, coalesce(sum(case type
      when 'CALL' then 10 when 'MEETING' then 12 when 'EMAIL' then 6 when 'NOTE' then 3 else 0 end), 0))
  into engagement
  from activities where lead_id = p_lead_id;

  fit := least(25,
    (case when l.icp_match then 5 else 0 end)
    + coalesce(l.budget_score, 0) * 0.5
    + coalesce(l.authority_score, 0) * 0.5
    + coalesce(l.need_score, 0) * 0.5
    + coalesce(l.timeline_score, 0) * 0.5);

  last_touch := l.last_activity_at;
  if last_touch is null then
    recency := 0;
  else
    recency := greatest(0, 15 - greatest(0, extract(epoch from now() - last_touch) / 86400 - 2) * (15.0 / 28));
  end if;

  return least(100, greatest(0, round(engagement + fit + recency)::int));
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function compute_deal_score(p_opportunity_id uuid) returns int as $$
declare
  engagement numeric;
  momentum numeric;
  recency numeric;
  o record;
begin
  select * into o from opportunities where id = p_opportunity_id;
  if o is null then return 0; end if;

  select least(60, coalesce(sum(case type
      when 'CALL' then 10 when 'MEETING' then 12 when 'EMAIL' then 6 when 'NOTE' then 3 else 0 end), 0))
  into engagement
  from activities where opportunity_id = p_opportunity_id;

  -- Momentum (up to 25): proposal sent + qualification fields filled.
  momentum := least(25,
    (case when exists (select 1 from deal_proposals dp where dp.opportunity_id = p_opportunity_id) then 10 else 0 end)
    + (case when o.budget_confirmed then 8 else 0 end)
    + (case when o.next_step is not null then 4 else 0 end)
    + (case when o.decision_timeframe is not null then 3 else 0 end));

  if o.last_activity_at is null then
    recency := 0;
  else
    recency := greatest(0, 15 - greatest(0, extract(epoch from now() - o.last_activity_at) / 86400 - 2) * (15.0 / 28));
  end if;

  return least(100, greatest(0, round(engagement + coalesce(momentum, 0) + recency)::int));
end;
$$ language plpgsql stable security definer set search_path = public;

-- Recalculate score + stamp last_activity_at whenever an activity is logged.
-- FIELD_UPDATE audit rows don't count as engagement, so they neither bump
-- last_activity_at nor trigger a recompute (prevents edits from looking like
-- outreach).
create or replace function refresh_engagement_on_activity() returns trigger as $$
begin
  if new.type = 'FIELD_UPDATE' then return new; end if;
  if new.lead_id is not null then
    update leads set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
    where id = new.lead_id;
    update leads set score = compute_lead_score(new.lead_id) where id = new.lead_id;
  end if;
  if new.opportunity_id is not null then
    update opportunities set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
    where id = new.opportunity_id;
    update opportunities set score = compute_deal_score(new.opportunity_id) where id = new.opportunity_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists activities_refresh_engagement on activities;
create trigger activities_refresh_engagement
  after insert on activities
  for each row execute function refresh_engagement_on_activity();

-- Nightly decay: recency erodes even with no new activity.
create or replace function recompute_engagement_scores() returns void as $$
begin
  update leads l set score = compute_lead_score(l.id)
  where l.converted_at is null and l.archived_at is null;

  update opportunities o set score = compute_deal_score(o.id)
  from deal_stages ds
  where ds.id = o.stage_id and not ds.is_closed_won and not ds.is_closed_lost and o.archived_at is null;
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('recompute-engagement-scores', '0 2 * * *', 'select recompute_engagement_scores();');

-- Backfill deals' last_activity_at + initial scores.
update opportunities o set last_activity_at = sub.max_at
from (select opportunity_id, max(occurred_at) as max_at from activities
      where opportunity_id is not null and type <> 'FIELD_UPDATE' group by opportunity_id) sub
where sub.opportunity_id = o.id and o.last_activity_at is null;

select recompute_engagement_scores();

-- ---------------------------------------------------------------------------
-- 5. STAGE AUTOMATION RULES (evaluated client-side so the rep gets a toast
-- with Undo — never a silent server-side stage flip)
-- ---------------------------------------------------------------------------

create table if not exists stage_automation_rules (
  id uuid primary key default gen_random_uuid(),
  from_stage_id uuid not null references deal_stages(id) on delete cascade,
  to_stage_id uuid not null references deal_stages(id) on delete cascade,
  requires_activity_type activity_type not null,
  -- optional extra condition: this opportunities column must be non-null
  -- (allowlisted in the UI: amount / next_step / close_date)
  requires_field varchar(60),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table stage_automation_rules enable row level security;

drop policy if exists "stage_automation_rules_select" on stage_automation_rules;
create policy "stage_automation_rules_select" on stage_automation_rules for select to authenticated using (true);

drop policy if exists "stage_automation_rules_write" on stage_automation_rules;
create policy "stage_automation_rules_write" on stage_automation_rules for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- 6. CLIENT HEALTH (post-sale)
-- ---------------------------------------------------------------------------

alter table projects
  add column if not exists health varchar(20) not null default 'ON_TRACK',
  add column if not exists satisfaction smallint;

do $$ begin
  alter table projects add constraint projects_health_check check (health in ('ON_TRACK', 'AT_RISK', 'DELAYED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table projects add constraint projects_satisfaction_check check (satisfaction is null or satisfaction between 1 and 5);
exception when duplicate_object then null; end $$;

-- Health/satisfaction/status are maintained by the delivery/account owner.
drop policy if exists "projects_update" on projects;
create policy "projects_update" on projects for update to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = projects.opportunity_id and o.owner_id = auth.uid())
  )
  with check (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = projects.opportunity_id and o.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 7. RENEWAL / REACTIVATION AUTOMATION
-- ---------------------------------------------------------------------------

alter table opportunities
  add column if not exists renewal_date date,
  add column if not exists last_renewal_reminder_at timestamptz;

-- Daily: reminder task + notification at 30 and 7 days before renewal_date
-- (deduped via last_renewal_reminder_at), and an overdue alert for renewals
-- past due with no activity logged since the renewal date.
create or replace function check_renewals() returns void as $$
declare
  r record;
  days_left int;
begin
  for r in
    select o.id, o.name, o.owner_id, o.renewal_date, o.last_renewal_reminder_at, o.last_activity_at
    from opportunities o
    join deal_stages ds on ds.id = o.stage_id
    where ds.is_closed_won and o.renewal_date is not null and o.archived_at is null
  loop
    days_left := r.renewal_date - current_date;

    if days_left in (30, 7)
       and (r.last_renewal_reminder_at is null or r.last_renewal_reminder_at::date < current_date) then
      insert into tasks (title, type, status, priority, due_at, assignee_id, opportunity_id)
      values ('Renewal due in ' || days_left || ' days: ' || r.name, 'FOLLOW_UP', 'NOT_STARTED',
              case when days_left = 7 then 'HIGH' else 'MEDIUM' end,
              r.renewal_date::timestamptz, r.owner_id, r.id);
      insert into notifications (user_id, type, message, link_url)
      values (r.owner_id, 'TASK_DUE', 'Renewal for "' || r.name || '" is due in ' || days_left || ' days', '/deals/' || r.id);
      update opportunities set last_renewal_reminder_at = now() where id = r.id;
    end if;

    -- Overdue alert fires ONCE per overdue streak (not daily): only when the
    -- last reminder predates the renewal date itself.
    if days_left < 0
       and (r.last_activity_at is null or r.last_activity_at::date <= r.renewal_date)
       and (r.last_renewal_reminder_at is null or r.last_renewal_reminder_at::date <= r.renewal_date) then
      insert into notifications (user_id, type, message, link_url)
      values (r.owner_id, 'DEAL_INACTIVE', 'Renewal overdue — "' || r.name || '" is at risk (no renewal activity logged)', '/deals/' || r.id);
      update opportunities set last_renewal_reminder_at = now() where id = r.id;
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('check-renewals', '30 8 * * *', 'select check_renewals();');
