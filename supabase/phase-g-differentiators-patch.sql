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

alter type deal_contact_role add value if not exists 'OTHER';

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
