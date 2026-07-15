-- Business logic that used to live in NestJS services, reimplemented as
-- Postgres triggers so it stays atomic and impossible to bypass from the
-- client (Phase D of the migration plan).
--
-- All logging trigger functions are SECURITY DEFINER so their own INSERT
-- into `activities` isn't blocked by RLS in edge cases (e.g. a manager
-- reassigning a lead to someone else — the activity's parent-ownership
-- check would otherwise fail since the manager isn't the new owner).
--
-- One small cosmetic deviation from the original app: completing a task via
-- the dedicated "Complete" button used to log the word "Completed" (title
-- case); a plain status-change PATCH to COMPLETED logged "COMPLETED" (raw
-- enum). Both code paths are now the same UPDATE statement at the DB level,
-- indistinguishable to a trigger, so this always logs "COMPLETED" now.

create function format_change(label text, old_val text, new_val text) returns text as $$
declare
  o text := coalesce(nullif(old_val, ''), '—');
  n text := coalesce(nullif(new_val, ''), '—');
begin
  if o = n then return null; end if;
  return label || ' changed: ' || o || ' → ' || n;
end;
$$ language plpgsql immutable;

-- ---------------------------------------------------------------------------
-- STAGE DELETE GUARDS (replaces the ConflictException checks in
-- lead-stages/account-stages/deal-stages .service.ts#remove())
-- ---------------------------------------------------------------------------

create function guard_lead_stage_delete() returns trigger as $$
declare cnt int;
begin
  select count(*) into cnt from leads where stage_id = old.id;
  if cnt > 0 then
    raise exception 'Cannot delete "%" — % lead(s) still in this stage. Move them first.', old.name, cnt;
  end if;
  return old;
end;
$$ language plpgsql;
create trigger lead_stages_guard_delete before delete on lead_stages
  for each row execute function guard_lead_stage_delete();

create function guard_account_stage_delete() returns trigger as $$
declare
  cnt int;
begin
  select count(*) into cnt from accounts where stage_id = old.id;
  if cnt > 0 then
    raise exception '%', format('Cannot delete "%s" — %s compan%s still in this stage. Move them first.',
      old.name, cnt, case when cnt = 1 then 'y' else 'ies' end);
  end if;
  return old;
end;
$$ language plpgsql;
create trigger account_stages_guard_delete before delete on account_stages
  for each row execute function guard_account_stage_delete();

create function guard_deal_stage_delete() returns trigger as $$
declare cnt int;
begin
  select count(*) into cnt from opportunities where stage_id = old.id;
  if cnt > 0 then
    raise exception 'Cannot delete "%" — % deal(s) still in this stage. Move them first.', old.name, cnt;
  end if;
  return old;
end;
$$ language plpgsql;
create trigger deal_stages_guard_delete before delete on deal_stages
  for each row execute function guard_deal_stage_delete();

create function guard_customer_stage_delete() returns trigger as $$
declare cnt int;
begin
  select count(*) into cnt from accounts where customer_stage_id = old.id;
  if cnt > 0 then
    raise exception '%', format('Cannot delete "%s" — %s account(s) still in this stage. Move them first.', old.name, cnt);
  end if;
  return old;
end;
$$ language plpgsql;
create trigger customer_stages_guard_delete before delete on customer_stages
  for each row execute function guard_customer_stage_delete();

-- ---------------------------------------------------------------------------
-- LEADS — "created" + field-change activity logging
-- ---------------------------------------------------------------------------

create function log_lead_created() returns trigger as $$
declare
  msgs text[] := array['Lead created'];
  account_name text;
begin
  if new.account_id is not null then
    select name into account_name from accounts where id = new.account_id;
    if account_name is not null then
      msgs := array_append(msgs, 'Linked to company: ' || account_name);
    end if;
  end if;
  -- auth.uid() is null when the insert runs under the service_role key (e.g. the
  -- bulk-import Edge Function) — fall back to the lead's own owner so the NOT NULL
  -- creator_id constraint is never violated by a privileged server-side insert.
  insert into activities (type, body, creator_id, lead_id)
  values ('FIELD_UPDATE', array_to_string(msgs, E'\n'), coalesce(auth.uid(), new.owner_id), new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger leads_log_created after insert on leads
  for each row execute function log_lead_created();

create function log_lead_changes() returns trigger as $$
declare
  msgs text[] := '{}';
  msg text;
  old_name text; new_name text;
begin
  if new.owner_id is distinct from old.owner_id then
    select full_name into old_name from profiles where id = old.owner_id;
    select full_name into new_name from profiles where id = new.owner_id;
    msg := format_change('Owner', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into old_name from lead_stages where id = old.stage_id;
    select name into new_name from lead_stages where id = new.stage_id;
    msg := format_change('Stage', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.value is distinct from old.value then
    msg := format_change('Lead Value', old.value::text, new.value::text);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.account_id is distinct from old.account_id then
    select name into old_name from accounts where id = old.account_id;
    select name into new_name from accounts where id = new.account_id;
    msg := format_change('Company', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if array_length(msgs, 1) > 0 then
    insert into activities (type, body, creator_id, lead_id)
    values ('FIELD_UPDATE', array_to_string(msgs, E'\n'), coalesce(auth.uid(), new.owner_id), new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger leads_log_changes after update on leads
  for each row execute function log_lead_changes();

-- ---------------------------------------------------------------------------
-- ACCOUNTS — field-change activity logging (no "created" logging, matching
-- the original app — accounts.service.ts never logged on create either)
-- ---------------------------------------------------------------------------

create function log_account_changes() returns trigger as $$
declare
  msgs text[] := '{}';
  msg text;
  old_name text; new_name text;
begin
  if new.owner_id is distinct from old.owner_id then
    select full_name into old_name from profiles where id = old.owner_id;
    select full_name into new_name from profiles where id = new.owner_id;
    msg := format_change('Owner', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into old_name from account_stages where id = old.stage_id;
    select name into new_name from account_stages where id = new.stage_id;
    msg := format_change('Status', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.annual_revenue is distinct from old.annual_revenue then
    msg := format_change('Annual Revenue', old.annual_revenue::text, new.annual_revenue::text);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if array_length(msgs, 1) > 0 then
    insert into activities (type, body, creator_id, account_id)
    values ('FIELD_UPDATE', array_to_string(msgs, E'\n'), coalesce(auth.uid(), new.owner_id), new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger accounts_log_changes after update on accounts
  for each row execute function log_account_changes();

-- ---------------------------------------------------------------------------
-- OPPORTUNITIES (deals) — field-change activity logging
-- ---------------------------------------------------------------------------

create function log_opportunity_changes() returns trigger as $$
declare
  msgs text[] := '{}';
  msg text;
  old_name text; new_name text;
begin
  if new.owner_id is distinct from old.owner_id then
    select full_name into old_name from profiles where id = old.owner_id;
    select full_name into new_name from profiles where id = new.owner_id;
    msg := format_change('Owner', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into old_name from deal_stages where id = old.stage_id;
    select name into new_name from deal_stages where id = new.stage_id;
    msg := format_change('Stage', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.amount is distinct from old.amount then
    msg := format_change('Amount', old.amount::text, new.amount::text);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if array_length(msgs, 1) > 0 then
    insert into activities (type, body, creator_id, opportunity_id)
    values ('FIELD_UPDATE', array_to_string(msgs, E'\n'), coalesce(auth.uid(), new.owner_id), new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger opportunities_log_changes after update on opportunities
  for each row execute function log_opportunity_changes();

-- Structured, queryable twin of the stage-change line in log_opportunity_changes()
-- above (that one writes a human-readable FIELD_UPDATE activity; this one
-- writes a machine-readable row to stage_history for "days in stage" /
-- "stage history log" on the Deal Detail page). Deliberately separate
-- functions/triggers so neither's behavior is coupled to the other's.
create function log_stage_history() returns trigger as $$
begin
  insert into stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  values (new.id, old.stage_id, new.stage_id, coalesce(auth.uid(), new.owner_id), now());
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger opportunities_log_stage_history
  after update on opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function log_stage_history();

-- Also seed the initial "entered stage" row on creation (not just later
-- changes), so "days in current stage" resolves for brand-new deals too.
create function log_stage_history_on_insert() returns trigger as $$
begin
  insert into stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  values (new.id, null, new.stage_id, coalesce(auth.uid(), new.owner_id), new.created_at);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger opportunities_log_stage_history_insert
  after insert on opportunities
  for each row execute function log_stage_history_on_insert();

-- ---------------------------------------------------------------------------
-- TASKS — "created" + field-change activity logging
-- ---------------------------------------------------------------------------

create function log_task_created() returns trigger as $$
begin
  insert into activities (type, body, creator_id, task_id)
  values ('FIELD_UPDATE', 'Task created', coalesce(auth.uid(), new.assignee_id), new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger tasks_log_created after insert on tasks
  for each row execute function log_task_created();

create function log_task_changes() returns trigger as $$
declare
  msgs text[] := '{}';
  msg text;
  old_name text; new_name text;
begin
  if new.status is distinct from old.status then
    msg := format_change('Status', replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' '));
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select full_name into old_name from profiles where id = old.assignee_id;
    select full_name into new_name from profiles where id = new.assignee_id;
    msg := format_change('Owner', old_name, new_name);
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if new.due_at is distinct from old.due_at then
    msg := format_change('Due date', to_char(old.due_at, 'MM/DD/YYYY'), to_char(new.due_at, 'MM/DD/YYYY'));
    if msg is not null then msgs := array_append(msgs, msg); end if;
  end if;
  if array_length(msgs, 1) > 0 then
    insert into activities (type, body, creator_id, task_id)
    values ('FIELD_UPDATE', array_to_string(msgs, E'\n'), coalesce(auth.uid(), new.assignee_id), new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger tasks_log_changes after update on tasks
  for each row execute function log_task_changes();

-- ---------------------------------------------------------------------------
-- DEAL WON -> promote the linked company to "Active Customer" (never
-- downgrades a company already further along, e.g. "Strategic Account").
-- ---------------------------------------------------------------------------

create function promote_account_to_customer() returns trigger as $$
declare
  won boolean;
  target_id uuid;
  target_order int;
  current_order int;
  existing_lifecycle_id uuid;
begin
  if new.account_id is null then
    return new;
  end if;

  select is_closed_won into won from deal_stages where id = new.stage_id;
  if not coalesce(won, false) then
    return new;
  end if;

  select id, "order" into target_id, target_order from account_stages where name = 'Customer';
  if target_id is null then
    return new;
  end if;

  select acs."order", a.customer_stage_id into current_order, existing_lifecycle_id
  from accounts a join account_stages acs on acs.id = a.stage_id
  where a.id = new.account_id;

  if current_order is null or current_order < target_order then
    update accounts set stage_id = target_id where id = new.account_id;
  end if;

  -- Seed the Customer Success lifecycle stage the first time an account
  -- becomes a customer — guarded so a later RENEWAL deal closing won on an
  -- account already at "Renewed" never bounces it back to "Onboarding".
  if existing_lifecycle_id is null then
    update accounts set customer_stage_id = (select id from customer_stages where is_default limit 1)
    where id = new.account_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger opportunities_promote_account_to_customer_ins
  after insert on opportunities
  for each row execute function promote_account_to_customer();

create trigger opportunities_promote_account_to_customer_upd
  after update on opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id or old.account_id is distinct from new.account_id)
  execute function promote_account_to_customer();

-- Auto-set closed_at when a deal's stage becomes closed (won or lost),
-- mirroring real CRM behavior — needed for Company "Customer Since" to be
-- meaningful for deals closed through the normal UI, not just seeded data.
create function set_deal_closed_at() returns trigger as $$
declare
  closed boolean;
  lost boolean;
begin
  select is_closed_won, is_closed_lost into closed, lost from deal_stages where id = new.stage_id;
  if coalesce(closed or lost, false) and new.closed_at is null then
    new.closed_at = now();
  end if;
  -- Closed Lost deals archive themselves automatically — matches the
  -- "Closed Lost -> Deal Archived" step in the CRM lifecycle diagram.
  if coalesce(lost, false) and new.archived_at is null then
    new.archived_at = now();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger opportunities_set_closed_at
  before insert or update on opportunities
  for each row execute function set_deal_closed_at();

-- ---------------------------------------------------------------------------
-- DEAL CREATION LOCKDOWN — a Deal can only come into existence by converting
-- a Qualified lead. auth.uid() is null only for trusted server-side inserts
-- (service-role edge functions, seed scripts); every normal authenticated
-- client insert must carry a lead_id pointing at a Qualified (is_won) lead.
-- This is the backstop behind removing every "New Deal" UI entry point.
-- ---------------------------------------------------------------------------

create function guard_deal_creation() returns trigger as $$
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

create trigger opportunities_guard_creation
  before insert on opportunities
  for each row execute function guard_deal_creation();

-- ---------------------------------------------------------------------------
-- CLOSED WON -> PROJECT HANDOVER — automatic, event-driven. No project is
-- created for a deal with no linked account (a project needs a company
-- context — name/value/contacts are all read through it, not duplicated).
-- ---------------------------------------------------------------------------

create function create_project_on_closed_won() returns trigger as $$
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

create trigger opportunities_create_project_ins
  after insert on opportunities
  for each row execute function create_project_on_closed_won();

create trigger opportunities_create_project_upd
  after update on opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function create_project_on_closed_won();

-- ---------------------------------------------------------------------------
-- LEAD QUALIFICATION GATE (MQL) — blocks a lead from entering a "won"
-- (Qualified) stage unless ICP Match, Budget, and Authority are filled in.
-- Enforces "Lead -> Contacts -> Company -> MQL -> Qualified" server-side so
-- it can't be bypassed by going around the UI.
-- ---------------------------------------------------------------------------

create function guard_lead_qualification() returns trigger as $$
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

create trigger leads_guard_qualification
  before update on leads
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function guard_lead_qualification();

-- ---------------------------------------------------------------------------
-- AUTOMATION RULES (CRM workflow rebuild)
-- ---------------------------------------------------------------------------

-- 1. Notify the lead owner the moment a lead becomes Qualified.
create function notify_lead_qualified() returns trigger as $$
declare
  won boolean;
  was_won boolean;
begin
  select is_won into won from lead_stages where id = new.stage_id;
  select is_won into was_won from lead_stages where id = old.stage_id;
  if coalesce(won, false) and not coalesce(was_won, false) and new.owner_id is not null then
    insert into notifications (user_id, type, message, link_url)
    values (
      new.owner_id, 'STAGE_CHANGED',
      'Lead "' || coalesce(new.lead_name, trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''))) || '" is now Qualified',
      '/leads/' || new.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger leads_notify_qualified
  after update on leads
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function notify_lead_qualified();

-- 1b. @Mentions: writing "@Full Name" in a note/activity sends that teammate
-- an in-app MENTION notification linking back to the record.
create function notify_mentions() returns trigger as $$
declare
  p record;
  target_url text;
begin
  if new.type = 'FIELD_UPDATE' then return new; end if;

  target_url := case
    when new.lead_id is not null then '/leads/' || new.lead_id
    when new.opportunity_id is not null then '/deals/' || new.opportunity_id
    when new.account_id is not null then '/companies/' || new.account_id
    when new.task_id is not null then '/tasks/' || new.task_id
    else '/'
  end;

  for p in select id, full_name from profiles where is_active and id <> new.creator_id
  loop
    if position(lower('@' || p.full_name) in lower(new.body)) > 0 then
      insert into notifications (user_id, type, message, link_url)
      values (
        p.id, 'MENTION',
        (select full_name from profiles where id = new.creator_id) || ' mentioned you: ' || left(new.body, 120),
        target_url
      );
    end if;
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger activities_notify_mentions
  after insert on activities
  for each row execute function notify_mentions();

-- 2. Auto-create a follow-up task 2 days after any MEETING activity is logged.
create function create_followup_task_after_meeting() returns trigger as $$
begin
  if new.type = 'MEETING' then
    insert into tasks (title, type, status, priority, due_at, assignee_id, lead_id, account_id, opportunity_id)
    values (
      'Follow up after meeting', 'FOLLOW_UP', 'NOT_STARTED', 'MEDIUM',
      new.occurred_at + interval '2 days', new.creator_id,
      new.lead_id, new.account_id, new.opportunity_id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger activities_create_followup_task
  after insert on activities
  for each row execute function create_followup_task_after_meeting();

-- Auto-set/clear resolved_at when a support ticket's status crosses into or
-- out of the resolved states, mirroring set_deal_closed_at's timestamp idiom.
create function set_ticket_resolved_at() returns trigger as $$
begin
  if new.status in ('RESOLVED', 'CLOSED') and old.status not in ('RESOLVED', 'CLOSED') then
    new.resolved_at = now();
  elsif new.status not in ('RESOLVED', 'CLOSED') and old.status in ('RESOLVED', 'CLOSED') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger support_tickets_set_resolved_at
  before update on support_tickets
  for each row execute function set_ticket_resolved_at();

-- ---------------------------------------------------------------------------
-- ENGAGEMENT SCORING — computed 0-100 score on leads and deals.
-- Engagement (≤60): weighted interaction counts. Fit/Momentum (≤25):
-- ICP+BANT on leads, proposal/qualification signals on deals.
-- Recency (≤15): full within 2 days of last activity, fading to 0 at 30.
-- Recalculated by trigger on every logged activity, decayed nightly by cron.
-- ---------------------------------------------------------------------------

create function compute_lead_score(p_lead_id uuid) returns int as $$
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

create function compute_deal_score(p_opportunity_id uuid) returns int as $$
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

-- FIELD_UPDATE audit rows don't count as engagement — they neither bump
-- last_activity_at nor trigger a recompute.
create function refresh_engagement_on_activity() returns trigger as $$
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

create trigger activities_refresh_engagement
  after insert on activities
  for each row execute function refresh_engagement_on_activity();

create function recompute_engagement_scores() returns void as $$
begin
  update leads l set score = compute_lead_score(l.id)
  where l.converted_at is null and l.archived_at is null;

  update opportunities o set score = compute_deal_score(o.id)
  from deal_stages ds
  where ds.id = o.stage_id and not ds.is_closed_won and not ds.is_closed_lost and o.archived_at is null;
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('recompute-engagement-scores', '0 2 * * *', 'select recompute_engagement_scores();');

-- ---------------------------------------------------------------------------
-- RENEWAL AUTOMATION — reminder task + notification 30 and 7 days before a
-- Closed Won deal's renewal_date (deduped per day via
-- last_renewal_reminder_at); a once-per-streak overdue alert when the
-- renewal date passes with no renewal activity logged.
-- ---------------------------------------------------------------------------

create function check_renewals() returns void as $$
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

-- 3. Alert a deal's owner when it's been inactive (no update) for 7+ days.
-- Fires once per inactive streak, not daily — last_inactivity_alert_at is
-- only re-armed once the deal is touched again (updated_at moves forward).
create function check_inactive_deals() returns void as $$
begin
  insert into notifications (user_id, type, message, link_url)
  select o.owner_id, 'DEAL_INACTIVE',
    'Deal "' || o.name || '" has had no activity for 7+ days',
    '/deals/' || o.id
  from opportunities o
  join deal_stages ds on ds.id = o.stage_id
  where not ds.is_closed_won and not ds.is_closed_lost
    and o.updated_at < now() - interval '7 days'
    and (o.last_inactivity_alert_at is null or o.last_inactivity_alert_at < o.updated_at);

  update opportunities o set last_inactivity_alert_at = now()
  from deal_stages ds
  where ds.id = o.stage_id
    and not ds.is_closed_won and not ds.is_closed_lost
    and o.updated_at < now() - interval '7 days'
    and (o.last_inactivity_alert_at is null or o.last_inactivity_alert_at < o.updated_at);
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('check-inactive-deals', '0 9 * * *', 'select check_inactive_deals();');

-- 4. Recommend "Inactive" for a customer account with no engagement (own
-- record updates, deal updates, or logged activities across its leads/deals)
-- for 180+ days. This is a RECOMMENDATION only — it notifies the account
-- owner and lets the frontend show an approve-to-change banner; it never
-- flips accounts.stage_id itself. Fires once per inactive streak, same
-- re-arm-on-new-activity guard as check_inactive_deals().
create function check_inactive_accounts() returns void as $$
begin
  with last_engagement as (
    select a.id as account_id,
      greatest(
        a.updated_at,
        coalesce((select max(o.updated_at) from opportunities o where o.account_id = a.id), a.created_at),
        coalesce((select max(act.occurred_at) from activities act
          where act.account_id = a.id
             or act.lead_id in (select id from leads where account_id = a.id)
             or act.opportunity_id in (select id from opportunities where account_id = a.id)), a.created_at)
      ) as last_touch
    from accounts a
  )
  insert into notifications (user_id, type, message, link_url)
  select a.owner_id, 'ACCOUNT_INACTIVE',
    'Company "' || a.name || '" has been inactive for 180+ days',
    '/companies/' || a.id
  from accounts a
  join account_stages ast on ast.id = a.stage_id
  join last_engagement le on le.account_id = a.id
  where ast.is_customer_stage and not ast.is_inactive_stage
    and le.last_touch < now() - interval '180 days'
    and (a.last_inactivity_alert_at is null or a.last_inactivity_alert_at < le.last_touch);

  with last_engagement as (
    select a.id as account_id,
      greatest(
        a.updated_at,
        coalesce((select max(o.updated_at) from opportunities o where o.account_id = a.id), a.created_at),
        coalesce((select max(act.occurred_at) from activities act
          where act.account_id = a.id
             or act.lead_id in (select id from leads where account_id = a.id)
             or act.opportunity_id in (select id from opportunities where account_id = a.id)), a.created_at)
      ) as last_touch
    from accounts a
  )
  update accounts a set last_inactivity_alert_at = now()
  from account_stages ast, last_engagement le
  where ast.id = a.stage_id and le.account_id = a.id
    and ast.is_customer_stage and not ast.is_inactive_stage
    and le.last_touch < now() - interval '180 days'
    and (a.last_inactivity_alert_at is null or a.last_inactivity_alert_at < le.last_touch);
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('check-inactive-accounts', '0 9 * * *', 'select check_inactive_accounts();');
