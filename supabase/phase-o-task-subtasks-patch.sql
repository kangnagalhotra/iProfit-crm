-- Phase O: Sub-tasks (checklist-style) on Tasks (Group 6 / G3). Safe as a
-- single transaction — no enum/type changes here.
--
-- Deliberately a lightweight checklist, not full nested Task rows: items
-- don't get their own assignee/due date/reminder, they're pure sub-checks
-- under the parent task's owner/due date. "2/4 done" progress and marking
-- an item complete independently is exactly what a checklist gives you
-- without the bigger scope of "sub-tasks are their own tasks".

create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  "order" int not null default 1,
  created_at timestamptz not null default now()
);
create index task_checklist_items_task_id_idx on task_checklist_items(task_id);

alter table task_checklist_items enable row level security;

-- Inherits visibility from the parent task (same shape as the
-- lead_contacts-inherits-from-leads pattern used throughout this schema).
create policy "task_checklist_items_select" on task_checklist_items for select to authenticated
  using (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())));

create policy "task_checklist_items_write" on task_checklist_items for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())))
  with check (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())));
