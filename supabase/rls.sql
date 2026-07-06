-- iProfit CRM — Row Level Security policies for Supabase
-- Replicates the exact authorization rules cataloged from the NestJS backend's
-- scopeWhere/assertAccess/canManage/@Roles patterns. Run after schema.sql.
--
-- Faithfully-carried-over quirks from the original app (not "fixed" here,
-- since the goal is behavior parity — flag separately if you want these
-- tightened):
--   1. A SALES_REP CAN set an arbitrary owner_id when CREATING a lead/account/
--      opportunity (the old leads.service.ts#create() took dto.ownerId as-is,
--      no role check) — they just can't REASSIGN an existing record they
--      don't own via UPDATE.
--   2. A SALES_REP CAN reassign a task's assignee_id via single-record UPDATE
--      (tasks.controller.ts never guarded PATCH /tasks/:id — only the bulk
--      reassignment endpoint was ADMIN/SALES_MANAGER-only).

-- ---------------------------------------------------------------------------
-- Helper: current user's role, via SECURITY DEFINER to avoid RLS recursion
-- when other tables' policies need to check it.
-- ---------------------------------------------------------------------------

create function get_my_role() returns role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function is_manager_or_admin() returns boolean as $$
  select get_my_role() in ('ADMIN', 'SALES_MANAGER');
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- PROFILES
-- Any authenticated user can read all profiles (needed to resolve owner/
-- assignee names throughout the app, exactly like GET /users today, which has
-- no @Roles restriction). Users can update their own row; ADMIN can update
-- anyone's (role changes, deactivation, assignment-pool toggling).
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy "profiles_select_all" on profiles for select
  to authenticated using (true);

create policy "profiles_update_self_or_admin" on profiles for update
  to authenticated
  using (id = auth.uid() or get_my_role() = 'ADMIN')
  with check (id = auth.uid() or get_my_role() = 'ADMIN');

-- No client INSERT/DELETE policy: profiles are created by a trigger on
-- auth.users signup (see auth-trigger.sql) and deleted via cascade from
-- auth.users, both using the service role which bypasses RLS.

-- ---------------------------------------------------------------------------
-- LEAD STAGES / ACCOUNT STAGES / DEAL STAGES
-- Readable by anyone authenticated; writable only by ADMIN/SALES_MANAGER
-- (matches @Roles(ADMIN, SALES_MANAGER) on create/update/reorder/delete).
-- ---------------------------------------------------------------------------

alter table lead_stages enable row level security;
alter table account_stages enable row level security;
alter table deal_stages enable row level security;
alter table pipelines enable row level security;

create policy "lead_stages_select_all" on lead_stages for select to authenticated using (true);
create policy "lead_stages_write_managers" on lead_stages for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

create policy "account_stages_select_all" on account_stages for select to authenticated using (true);
create policy "account_stages_write_managers" on account_stages for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

create policy "deal_stages_select_all" on deal_stages for select to authenticated using (true);
create policy "deal_stages_write_managers" on deal_stages for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

create policy "pipelines_select_all" on pipelines for select to authenticated using (true);
create policy "pipelines_write_admin" on pipelines for all to authenticated
  using (get_my_role() = 'ADMIN') with check (get_my_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- LEADS
-- SALES_REP: sees/edits only rows they own; cannot reassign (WITH CHECK keeps
-- owner_id pinned to themselves on UPDATE); cannot DELETE at all (old
-- DELETE /leads/:id was @Roles(ADMIN, SALES_MANAGER)-only, so a rep never
-- reached the service's own-record delete check).
-- SALES_MANAGER/ADMIN: unrestricted.
-- Anyone can INSERT (create is open to all roles; owner_id is not restricted
-- at insert time — see quirk #1 above).
-- ---------------------------------------------------------------------------

alter table leads enable row level security;

create policy "leads_select" on leads for select to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid());

create policy "leads_insert" on leads for insert to authenticated
  with check (true);

create policy "leads_update" on leads for update to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid())
  with check (is_manager_or_admin() or owner_id = auth.uid());

create policy "leads_delete" on leads for delete to authenticated
  using (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- ACCOUNTS (companies) — identical shape to leads.
-- ---------------------------------------------------------------------------

alter table accounts enable row level security;

create policy "accounts_select" on accounts for select to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid());

create policy "accounts_insert" on accounts for insert to authenticated
  with check (true);

create policy "accounts_update" on accounts for update to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid())
  with check (is_manager_or_admin() or owner_id = auth.uid());

create policy "accounts_delete" on accounts for delete to authenticated
  using (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- OPPORTUNITIES (deals) — identical shape; owner_id is NOT NULL here.
-- ---------------------------------------------------------------------------

alter table opportunities enable row level security;

create policy "opportunities_select" on opportunities for select to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid());

create policy "opportunities_insert" on opportunities for insert to authenticated
  with check (true);

create policy "opportunities_update" on opportunities for update to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid())
  with check (is_manager_or_admin() or owner_id = auth.uid());

create policy "opportunities_delete" on opportunities for delete to authenticated
  using (is_manager_or_admin());

-- stage_history: written by the Edge Function / trigger layer (Phase D/E)
-- using the service role; no direct client access needed.
alter table stage_history enable row level security;

-- ---------------------------------------------------------------------------
-- TASKS
-- SALES_REP: sees/manages only tasks assigned to them (canManage pattern).
-- Faithfully NOT restricting who they can reassign a task TO on single
-- update — see quirk #2 above.
-- ---------------------------------------------------------------------------

alter table tasks enable row level security;

create policy "tasks_select" on tasks for select to authenticated
  using (is_manager_or_admin() or assignee_id = auth.uid());

create policy "tasks_insert" on tasks for insert to authenticated
  with check (true);

create policy "tasks_update" on tasks for update to authenticated
  using (is_manager_or_admin() or assignee_id = auth.uid())
  with check (is_manager_or_admin() or assignee_id = auth.uid());

create policy "tasks_delete" on tasks for delete to authenticated
  using (is_manager_or_admin() or assignee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ACTIVITIES (notes, calls, emails, meetings, field-update log)
-- Visibility inherits from whichever parent record (lead/account/
-- opportunity/task) the activity is linked to — mirrors assertAccess().
-- ---------------------------------------------------------------------------

alter table activities enable row level security;

create policy "activities_select" on activities for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from leads l where l.id = activities.lead_id and l.owner_id = auth.uid())
    or exists (select 1 from accounts a where a.id = activities.account_id and a.owner_id = auth.uid())
    or exists (select 1 from opportunities o where o.id = activities.opportunity_id and o.owner_id = auth.uid())
    or exists (select 1 from tasks t where t.id = activities.task_id and t.assignee_id = auth.uid())
  );

create policy "activities_insert" on activities for insert to authenticated
  with check (
    creator_id = auth.uid()
    and (
      is_manager_or_admin()
      or exists (select 1 from leads l where l.id = activities.lead_id and l.owner_id = auth.uid())
      or exists (select 1 from accounts a where a.id = activities.account_id and a.owner_id = auth.uid())
      or exists (select 1 from opportunities o where o.id = activities.opportunity_id and o.owner_id = auth.uid())
      or exists (select 1 from tasks t where t.id = activities.task_id and t.assignee_id = auth.uid())
    )
  );

create policy "activities_update_own" on activities for update to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy "activities_delete" on activities for delete to authenticated
  using (creator_id = auth.uid() or is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS — strictly personal, no manager override (matches the
-- original NotificationsService: findForUser/markRead/markAllRead all
-- scoped to notification.userId === user.id with no role exception).
-- No INSERT policy: created only by the reminders Edge Function / triggers
-- using the service role, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table notifications enable row level security;

create policy "notifications_select_own" on notifications for select to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own" on notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- assignment_state: no client policies at all — only the round-robin Edge
-- Function (service role) reads/writes this.
alter table assignment_state enable row level security;
