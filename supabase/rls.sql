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

alter table customer_stages enable row level security;
create policy "customer_stages_select_all" on customer_stages for select to authenticated using (true);
create policy "customer_stages_write_managers" on customer_stages for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

create policy "pipelines_select_all" on pipelines for select to authenticated using (true);
create policy "pipelines_write_admin" on pipelines for all to authenticated
  using (get_my_role() = 'ADMIN') with check (get_my_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- LEAD SOURCE OPTIONS (Group 1 / A1) — same shape as the stages tables above.
-- ---------------------------------------------------------------------------

alter table lead_source_options enable row level security;
create policy "lead_source_options_select" on lead_source_options for select to authenticated using (true);
create policy "lead_source_options_write" on lead_source_options for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

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
-- CONTACTS (person records) — identical shape to leads.
-- ---------------------------------------------------------------------------

alter table contacts enable row level security;

create policy "contacts_select" on contacts for select to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid());

create policy "contacts_insert" on contacts for insert to authenticated
  with check (true);

create policy "contacts_update" on contacts for update to authenticated
  using (is_manager_or_admin() or owner_id = auth.uid())
  with check (is_manager_or_admin() or owner_id = auth.uid());

create policy "contacts_delete" on contacts for delete to authenticated
  using (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- LEAD_CONTACTS — many-to-many join; visibility/write inherit from the
-- parent lead (identical shape to deal_contacts).
-- ---------------------------------------------------------------------------

alter table lead_contacts enable row level security;

create policy "lead_contacts_select" on lead_contacts for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

create policy "lead_contacts_insert" on lead_contacts for insert to authenticated
  with check (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

create policy "lead_contacts_delete" on lead_contacts for delete to authenticated
  using (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- LEAD / OPPORTUNITY ADDITIONAL OWNERS (Group 1 / A3) — inherit visibility
-- from the parent row, same shape as lead_contacts above. Purely additive:
-- the parent's own owner_id = auth.uid() policies are untouched.
-- ---------------------------------------------------------------------------

alter table lead_additional_owners enable row level security;
alter table opportunity_additional_owners enable row level security;

create policy "lead_additional_owners_select" on lead_additional_owners for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_additional_owners.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

create policy "lead_additional_owners_write" on lead_additional_owners for all to authenticated
  using (exists (select 1 from leads l where l.id = lead_additional_owners.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())))
  with check (exists (select 1 from leads l where l.id = lead_additional_owners.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));

create policy "opportunity_additional_owners_select" on opportunity_additional_owners for select to authenticated
  using (exists (select 1 from opportunities o where o.id = opportunity_additional_owners.opportunity_id and (is_manager_or_admin() or o.owner_id = auth.uid())));

create policy "opportunity_additional_owners_write" on opportunity_additional_owners for all to authenticated
  using (exists (select 1 from opportunities o where o.id = opportunity_additional_owners.opportunity_id and (is_manager_or_admin() or o.owner_id = auth.uid())))
  with check (exists (select 1 from opportunities o where o.id = opportunity_additional_owners.opportunity_id and (is_manager_or_admin() or o.owner_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- SOCIAL LINKS (Group 1 / A4) — inherits visibility from whichever parent
-- (lead or contact) the row belongs to.
-- ---------------------------------------------------------------------------

alter table social_links enable row level security;

create policy "social_links_select" on social_links for select to authenticated
  using (
    (lead_id is not null and exists (select 1 from leads l where l.id = social_links.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())))
    or (contact_id is not null and exists (select 1 from contacts c where c.id = social_links.contact_id and (is_manager_or_admin() or c.owner_id = auth.uid())))
  );

create policy "social_links_write" on social_links for all to authenticated
  using (
    (lead_id is not null and exists (select 1 from leads l where l.id = social_links.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())))
    or (contact_id is not null and exists (select 1 from contacts c where c.id = social_links.contact_id and (is_manager_or_admin() or c.owner_id = auth.uid())))
  )
  with check (
    (lead_id is not null and exists (select 1 from leads l where l.id = social_links.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())))
    or (contact_id is not null and exists (select 1 from contacts c where c.id = social_links.contact_id and (is_manager_or_admin() or c.owner_id = auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- PRODUCTS — single catalog, readable by anyone authenticated, writable only
-- by ADMIN/SALES_MANAGER (same shape as the stage tables above).
-- ---------------------------------------------------------------------------

alter table products enable row level security;

create policy "products_select_all" on products for select to authenticated using (true);
create policy "products_write_managers" on products for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- SUPPORT TICKETS — assignee_id is nullable (unassigned-inbox pattern), so
-- visibility also extends to the linked account's owner: an AM should see
-- tickets on their own customer even when a different support rep is
-- assigned. Anyone can INSERT (filing a ticket for someone else's account is
-- a normal support-desk workflow, matches leads/accounts/opportunities/tasks).
-- ---------------------------------------------------------------------------

alter table support_tickets enable row level security;

create policy "support_tickets_select" on support_tickets for select to authenticated
  using (
    is_manager_or_admin()
    or assignee_id = auth.uid()
    or exists (select 1 from accounts a where a.id = support_tickets.account_id and a.owner_id = auth.uid())
  );

create policy "support_tickets_insert" on support_tickets for insert to authenticated
  with check (true);

create policy "support_tickets_update" on support_tickets for update to authenticated
  using (
    is_manager_or_admin()
    or assignee_id = auth.uid()
    or exists (select 1 from accounts a where a.id = support_tickets.account_id and a.owner_id = auth.uid())
  )
  with check (
    is_manager_or_admin()
    or assignee_id = auth.uid()
    or exists (select 1 from accounts a where a.id = support_tickets.account_id and a.owner_id = auth.uid())
  );

create policy "support_tickets_delete" on support_tickets for delete to authenticated
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

-- ---------------------------------------------------------------------------
-- DEAL_CONTACTS / DEAL_LINE_ITEMS — child rows of opportunities; visibility
-- and write access inherit from the parent deal (identical shape to
-- ACTIVITIES below).
-- ---------------------------------------------------------------------------

alter table deal_contacts enable row level security;

create policy "deal_contacts_select" on deal_contacts for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_contacts_insert" on deal_contacts for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_contacts_update" on deal_contacts for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_contacts_delete" on deal_contacts for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

alter table deal_line_items enable row level security;

create policy "deal_line_items_select" on deal_line_items for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_line_items_insert" on deal_line_items for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_line_items_update" on deal_line_items for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_line_items_delete" on deal_line_items for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- DEAL_ATTACHMENTS — file metadata; ownership inherits from the parent deal.
-- The matching Supabase Storage bucket ('deal-attachments') has its own
-- path-prefix-scoped policies on storage.objects (see phase-c patch).
-- ---------------------------------------------------------------------------

alter table deal_attachments enable row level security;

create policy "deal_attachments_select" on deal_attachments for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
  );

create policy "deal_attachments_insert" on deal_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      is_manager_or_admin()
      or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
    )
  );

create policy "deal_attachments_delete" on deal_attachments for delete to authenticated
  using (
    is_manager_or_admin()
    or uploaded_by = auth.uid()
    or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- LEAD ATTACHMENTS — structural mirror of deal_attachments above, scoped via
-- leads.owner_id instead of opportunities.owner_id.
-- ---------------------------------------------------------------------------

alter table lead_attachments enable row level security;

create policy "lead_attachments_select" on lead_attachments for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
  );

create policy "lead_attachments_insert" on lead_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      is_manager_or_admin()
      or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
    )
  );

create policy "lead_attachments_delete" on lead_attachments for delete to authenticated
  using (
    is_manager_or_admin()
    or uploaded_by = auth.uid()
    or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
  );

-- stage_history: activated (see triggers.sql's log_stage_history()) —
-- system-authored only, no insert/update/delete policy for clients.
alter table stage_history enable row level security;

create policy "stage_history_select" on stage_history for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = stage_history.opportunity_id and o.owner_id = auth.uid())
  );

-- projects: created only by the Closed Won trigger; health/satisfaction/
-- status are then maintained by the deal owner or managers.
alter table projects enable row level security;

create policy "projects_select" on projects for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = projects.opportunity_id and o.owner_id = auth.uid())
  );

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
-- PROPOSAL TEMPLATES — single shared catalog (Group 5 / F2), same shape as
-- products/stages: readable by anyone, writable only by managers/admins.
-- ---------------------------------------------------------------------------

alter table proposal_templates enable row level security;

create policy "proposal_templates_select" on proposal_templates for select to authenticated using (true);

create policy "proposal_templates_write" on proposal_templates for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- DEAL_PROPOSALS — child rows of opportunities; access inherits from the
-- parent deal (identical shape to deal_line_items).
-- ---------------------------------------------------------------------------

alter table deal_proposals enable row level security;

create policy "deal_proposals_select" on deal_proposals for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_proposals_insert" on deal_proposals for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_proposals_update" on deal_proposals for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

create policy "deal_proposals_delete" on deal_proposals for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_proposals.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- STAGE_AUTOMATION_RULES — readable by anyone authenticated, writable only
-- by ADMIN/SALES_MANAGER (same shape as the stage tables).
-- ---------------------------------------------------------------------------

alter table stage_automation_rules enable row level security;

create policy "stage_automation_rules_select" on stage_automation_rules for select to authenticated using (true);
create policy "stage_automation_rules_write" on stage_automation_rules for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

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
-- TASK CHECKLIST ITEMS (Group 6 / G3) — inherit visibility from the parent
-- task, same shape as lead_contacts inheriting from leads.
-- ---------------------------------------------------------------------------

alter table task_checklist_items enable row level security;

create policy "task_checklist_items_select" on task_checklist_items for select to authenticated
  using (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())));

create policy "task_checklist_items_write" on task_checklist_items for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())))
  with check (exists (select 1 from tasks t where t.id = task_checklist_items.task_id and (is_manager_or_admin() or t.assignee_id = auth.uid())));

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

-- ---------------------------------------------------------------------------
-- STORAGE — deal-attachments bucket. Path convention is
-- {opportunity_id}/{uuid}-{filename}; storage.foldername(storage.objects.name)[1] extracts
-- the first path segment, which doubles as the authorization key against
-- the parent opportunity's visibility.
-- ---------------------------------------------------------------------------

create policy "deal_attachments_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );

create policy "deal_attachments_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );

create policy "deal_attachments_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- STORAGE — lead-attachments bucket. Same {lead_id}/{uuid}-{filename} path
-- convention, scoped against leads instead of opportunities.
-- ---------------------------------------------------------------------------

create policy "lead_attachments_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );

create policy "lead_attachments_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );

create policy "lead_attachments_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );

alter table assignment_state enable row level security;

-- ai_assist_log: written only by the ai-assist Edge Function (service role);
-- reps read their own usage, managers/admins read everyone's.
alter table ai_assist_log enable row level security;
create policy "ai_assist_log_select_own_or_manager" on ai_assist_log for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('ADMIN', 'SALES_MANAGER')
  ));

-- ---------------------------------------------------------------------------
-- MERGE ACCOUNTS (companies) — admin/manager only. Repoints every dependent
-- row (leads, contacts, opportunities, tasks, activities, support tickets)
-- from source to target, then deletes the source account. security definer
-- so it can bypass each table's owner-scoped RLS for the repoint itself; the
-- is_manager_or_admin() check inside is what actually gates who may call it.
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
