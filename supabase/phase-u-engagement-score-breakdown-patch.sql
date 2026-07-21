-- Phase U: Engagement Score transparency. compute_lead_score()/
-- compute_deal_score() (triggers.sql) already compute and decay the 0-100
-- engagement score shown on the Lead/Deal list, Hot Leads strip, and detail
-- chip — but it's a bare number with no explanation. These two new
-- functions independently recompute the exact same formula (copied, not
-- calling into the existing functions) and return the components instead
-- of just the sum, so the UI can show "why" without touching the
-- already-live scoring trigger at all.
--
-- Safe as a single transaction — no enum ADD VALUE here.

create function lead_score_breakdown(p_lead_id uuid) returns jsonb as $$
declare
  l record;
  call_count int;
  meeting_count int;
  email_count int;
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
    count(*) filter (where type = 'NOTE')
  into call_count, meeting_count, email_count, note_count
  from activities where lead_id = p_lead_id;

  engagement := least(60, coalesce(call_count, 0) * 10 + coalesce(meeting_count, 0) * 12
    + coalesce(email_count, 0) * 6 + coalesce(note_count, 0) * 3);

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
    'emailCount', coalesce(email_count, 0), 'noteCount', coalesce(note_count, 0),
    'fit', round(fit), 'fitMax', 25,
    'icpMatch', l.icp_match, 'budgetScore', l.budget_score, 'authorityScore', l.authority_score,
    'needScore', l.need_score, 'timelineScore', l.timeline_score,
    'recency', round(recency), 'recencyMax', 15,
    'daysSinceActivity', case when days_since is null then null else round(days_since) end
  );
end;
$$ language plpgsql stable security definer set search_path = public;

create function deal_score_breakdown(p_opportunity_id uuid) returns jsonb as $$
declare
  o record;
  call_count int;
  meeting_count int;
  email_count int;
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
    count(*) filter (where type = 'NOTE')
  into call_count, meeting_count, email_count, note_count
  from activities where opportunity_id = p_opportunity_id;

  engagement := least(60, coalesce(call_count, 0) * 10 + coalesce(meeting_count, 0) * 12
    + coalesce(email_count, 0) * 6 + coalesce(note_count, 0) * 3);

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
    'emailCount', coalesce(email_count, 0), 'noteCount', coalesce(note_count, 0),
    'momentum', round(momentum), 'momentumMax', 25,
    'hasProposal', has_proposal, 'budgetConfirmed', o.budget_confirmed,
    'nextStepSet', o.next_step is not null, 'decisionTimeframeSet', o.decision_timeframe is not null,
    'recency', round(recency), 'recencyMax', 15,
    'daysSinceActivity', case when days_since is null then null else round(days_since) end
  );
end;
$$ language plpgsql stable security definer set search_path = public;
