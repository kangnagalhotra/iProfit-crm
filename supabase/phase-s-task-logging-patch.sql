-- Phase S: unify quick-action logging into Tasks. Reps logging a Call/Email/
-- Meeting from the Lead/Deal/Company/Contact quick-action row now create a
-- single tasks row (not a separate activities row too). `activities` stays,
-- but becomes an auto-derived log — this patch adds a trigger that inserts a
-- linked activity whenever a Call/Email/Meeting task is completed (via the
-- existing but previously-unused activities.task_id FK), so engagement
-- scoring / stage automation / renewal tracking keep working unchanged.
--
-- Safe as a single transaction — no enum ADD VALUE here.

alter table tasks add column if not exists contact_id uuid references contacts(id) on delete set null;
alter table tasks add column if not exists created_via text not null default 'MANUAL'
  check (created_via in ('MANUAL', 'QUICK_ACTION'));
create index if not exists tasks_contact_id_idx on tasks(contact_id);

-- Fires on insert (quick-action "this already happened" creates an
-- already-COMPLETED row directly) and on update (completing a task from
-- TaskDetail/TasksWidget/Kanban/bulk-complete). Idempotent — guards against
-- a task being reopened and re-completed from creating a second activity.
-- Compares new.type::text (not the bare enum) against the literal list —
-- 'MEETING' isn't guaranteed to be a valid task_type label on every
-- environment (see phase-k-meeting-task-type-patch.sql, which may not have
-- been applied everywhere yet); comparing as text avoids the whole
-- expression failing to evaluate — and therefore blocking CALL/EMAIL
-- completions too — just because one literal isn't a valid enum member yet.
create or replace function log_completed_task_as_activity() returns trigger as $$
declare
  activity_kind activity_type;
begin
  if new.status <> 'COMPLETED' then return new; end if;
  if new.type::text not in ('CALL', 'EMAIL', 'MEETING') then return new; end if;
  -- task_type and activity_type are separate enums with the same labels for
  -- Call/Email/Meeting — cast via text rather than a direct enum-to-enum
  -- comparison/assignment, which Postgres rejects outright.
  activity_kind := new.type::text::activity_type;
  if exists (select 1 from activities where task_id = new.id and type = activity_kind) then return new; end if;

  insert into activities (type, body, occurred_at, creator_id, lead_id, account_id, opportunity_id, task_id)
  values (
    activity_kind,
    coalesce(new.notes, initcap(lower(new.type::text)) || ' logged: ' || new.title),
    coalesce(new.completed_at, now()),
    new.assignee_id,
    new.lead_id, new.account_id, new.opportunity_id, new.id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists tasks_log_completed_activity on tasks;
create trigger tasks_log_completed_activity
  after insert or update on tasks
  for each row execute function log_completed_task_as_activity();
