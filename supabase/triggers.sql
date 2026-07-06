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
