-- Phase W: run AFTER phase-v-other-activity-type-patch.sql (this file
-- references the 'OTHER' enum value that patch adds). Safe as a single
-- transaction otherwise.
--
-- 1. activities.contact_id — mirrors tasks.contact_id, so a fresh "logged
--    as done" Activity triggered from ContactDetail.tsx (no lead/deal
--    context) has somewhere to attach.
-- 2. OTHER gets a mid-tier engagement weight (between NOTE's 3 and EMAIL's
--    6) in every function that already copies this exact weighting.
-- 3. The completed-task-to-activity trigger now also covers OTHER-type
--    tasks (sub-case A: completing a task that was actually scheduled).
-- 4. One-time backfill: already-COMPLETED CALL/EMAIL/MEETING tasks that
--    predate the completion trigger and have no linked activity yet get
--    one now, so they don't just vanish once task views stop showing
--    completed tasks.

alter table activities add column if not exists contact_id uuid references contacts(id) on delete set null;

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
      when 'CALL' then 10 when 'MEETING' then 12 when 'EMAIL' then 6 when 'OTHER' then 5 when 'NOTE' then 3 else 0 end), 0))
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
      when 'CALL' then 10 when 'MEETING' then 12 when 'EMAIL' then 6 when 'OTHER' then 5 when 'NOTE' then 3 else 0 end), 0))
  into engagement
  from activities where opportunity_id = p_opportunity_id;

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

create or replace function lead_score_breakdown(p_lead_id uuid) returns jsonb as $$
declare
  l record;
  call_count int;
  meeting_count int;
  email_count int;
  other_count int;
  note_count int;
  engagement numeric;
  fit numeric;
  days_since numeric;
  recency numeric;
begin
  select * into l from leads where id = p_lead_id;
  if l is null then return null; end if;

  select
    count(*) filter (where type = 'CALL'),
    count(*) filter (where type = 'MEETING'),
    count(*) filter (where type = 'EMAIL'),
    count(*) filter (where type = 'OTHER'),
    count(*) filter (where type = 'NOTE')
  into call_count, meeting_count, email_count, other_count, note_count
  from activities where lead_id = p_lead_id;

  engagement := least(60, coalesce(call_count, 0) * 10 + coalesce(meeting_count, 0) * 12
    + coalesce(email_count, 0) * 6 + coalesce(other_count, 0) * 5 + coalesce(note_count, 0) * 3);

  fit := least(25,
    (case when l.icp_match then 5 else 0 end)
    + coalesce(l.budget_score, 0) * 0.5
    + coalesce(l.authority_score, 0) * 0.5
    + coalesce(l.need_score, 0) * 0.5
    + coalesce(l.timeline_score, 0) * 0.5);

  if l.last_activity_at is null then
    days_since := null;
    recency := 0;
  else
    days_since := extract(epoch from now() - l.last_activity_at) / 86400;
    recency := greatest(0, 15 - greatest(0, days_since - 2) * (15.0 / 28));
  end if;

  return jsonb_build_object(
    'total', l.score,
    'engagement', round(engagement), 'engagementMax', 60,
    'callCount', coalesce(call_count, 0), 'meetingCount', coalesce(meeting_count, 0),
    'emailCount', coalesce(email_count, 0), 'otherCount', coalesce(other_count, 0), 'noteCount', coalesce(note_count, 0),
    'fit', round(fit), 'fitMax', 25,
    'icpMatch', l.icp_match, 'budgetScore', l.budget_score, 'authorityScore', l.authority_score,
    'needScore', l.need_score, 'timelineScore', l.timeline_score,
    'recency', round(recency), 'recencyMax', 15,
    'daysSinceActivity', case when days_since is null then null else round(days_since) end
  );
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function deal_score_breakdown(p_opportunity_id uuid) returns jsonb as $$
declare
  o record;
  call_count int;
  meeting_count int;
  email_count int;
  other_count int;
  note_count int;
  engagement numeric;
  has_proposal boolean;
  momentum numeric;
  days_since numeric;
  recency numeric;
begin
  select * into o from opportunities where id = p_opportunity_id;
  if o is null then return null; end if;

  select
    count(*) filter (where type = 'CALL'),
    count(*) filter (where type = 'MEETING'),
    count(*) filter (where type = 'EMAIL'),
    count(*) filter (where type = 'OTHER'),
    count(*) filter (where type = 'NOTE')
  into call_count, meeting_count, email_count, other_count, note_count
  from activities where opportunity_id = p_opportunity_id;

  engagement := least(60, coalesce(call_count, 0) * 10 + coalesce(meeting_count, 0) * 12
    + coalesce(email_count, 0) * 6 + coalesce(other_count, 0) * 5 + coalesce(note_count, 0) * 3);

  has_proposal := exists (select 1 from deal_proposals dp where dp.opportunity_id = p_opportunity_id);
  momentum := least(25,
    (case when has_proposal then 10 else 0 end)
    + (case when o.budget_confirmed then 8 else 0 end)
    + (case when o.next_step is not null then 4 else 0 end)
    + (case when o.decision_timeframe is not null then 3 else 0 end));

  if o.last_activity_at is null then
    days_since := null;
    recency := 0;
  else
    days_since := extract(epoch from now() - o.last_activity_at) / 86400;
    recency := greatest(0, 15 - greatest(0, days_since - 2) * (15.0 / 28));
  end if;

  return jsonb_build_object(
    'total', o.score,
    'engagement', round(engagement), 'engagementMax', 60,
    'callCount', coalesce(call_count, 0), 'meetingCount', coalesce(meeting_count, 0),
    'emailCount', coalesce(email_count, 0), 'otherCount', coalesce(other_count, 0), 'noteCount', coalesce(note_count, 0),
    'momentum', round(momentum), 'momentumMax', 25,
    'hasProposal', has_proposal, 'budgetConfirmed', o.budget_confirmed,
    'nextStepSet', o.next_step is not null, 'decisionTimeframeSet', o.decision_timeframe is not null,
    'recency', round(recency), 'recencyMax', 15,
    'daysSinceActivity', case when days_since is null then null else round(days_since) end
  );
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function log_completed_task_as_activity() returns trigger as $$
declare
  activity_kind activity_type;
begin
  if new.status <> 'COMPLETED' then return new; end if;
  if new.type::text not in ('CALL', 'EMAIL', 'MEETING', 'OTHER') then return new; end if;
  activity_kind := new.type::text::activity_type;
  if exists (select 1 from activities where task_id = new.id and type = activity_kind) then return new; end if;

  insert into activities (type, body, occurred_at, creator_id, lead_id, account_id, opportunity_id, contact_id, task_id)
  values (
    activity_kind,
    coalesce(new.notes, initcap(lower(new.type::text)) || ' logged: ' || new.title),
    coalesce(new.completed_at, now()),
    new.assignee_id,
    new.lead_id, new.account_id, new.opportunity_id, new.contact_id, new.id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill: completed CALL/EMAIL/MEETING tasks from before this trigger
-- existed (or before it fired, e.g. imported/legacy data) have no linked
-- activity yet — without this, that history would just disappear once
-- task views stop showing completed tasks.
insert into activities (type, body, occurred_at, creator_id, lead_id, account_id, opportunity_id, contact_id, task_id)
select
  t.type::text::activity_type,
  coalesce(t.notes, initcap(lower(t.type::text)) || ' logged: ' || t.title),
  coalesce(t.completed_at, t.updated_at),
  t.assignee_id,
  t.lead_id, t.account_id, t.opportunity_id, t.contact_id, t.id
from tasks t
where t.status = 'COMPLETED'
  and t.type::text in ('CALL', 'EMAIL', 'MEETING')
  and not exists (select 1 from activities a where a.task_id = t.id);
