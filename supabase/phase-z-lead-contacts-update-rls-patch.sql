-- lead_contacts was missing an UPDATE policy (select/insert/delete existed,
-- update did not) — RLS silently blocks any update with no error, so
-- setLeadContactRole() (frontend/src/api/leadContacts.ts) appeared to
-- succeed (toast "Contact role updated") while the role/role_other columns
-- never actually changed. Mirrors deal_contacts_update's exact shape.

create policy "lead_contacts_update" on lead_contacts for update to authenticated
  using (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())))
  with check (exists (select 1 from leads l where l.id = lead_contacts.lead_id and (is_manager_or_admin() or l.owner_id = auth.uid())));
