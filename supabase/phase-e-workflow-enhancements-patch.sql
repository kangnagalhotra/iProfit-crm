-- Phase E patch: Lead-to-Deal workflow enhancements.
--   1. Leads: consolidate Phone/Mobile into a single "Mobile Number" field.
--   2. Lead stages: rename "Working" -> "Attempted Contact" to match the
--      HubSpot-inspired stage naming (New / Attempted Contact / Contacted /
--      Qualified / Unqualified).
--   3. MQL gate: an `icp_match` flag plus a trigger that blocks a lead from
--      entering a "won" (Qualified) stage unless ICP + Budget + Authority
--      are filled in — makes the qualification workflow unskippable from
--      any client, not just the UI.
--   4. Contacts: add mobile / department / notes columns for the new
--      standalone Contacts module.
--   5. merge_accounts(): admin/manager-only company-merge RPC.
--
-- Idempotent, run top-to-bottom in one pass (SQL Editor or
-- `supabase db push --linked --file`), same as phase-b/c/d.

-- ---------------------------------------------------------------------------
-- 1. LEADS — Mobile Number consolidation
-- ---------------------------------------------------------------------------

update leads set mobile = phone where mobile is null and phone is not null;

-- ---------------------------------------------------------------------------
-- 2. LEAD STAGES — rename to match the spec's stage list
-- ---------------------------------------------------------------------------

update lead_stages set name = 'Attempted Contact', "order" = 2 where name = 'Working';
update lead_stages set "order" = 3 where name = 'Contacted';

-- ---------------------------------------------------------------------------
-- 3. MQL GATE
-- ---------------------------------------------------------------------------

alter table leads add column if not exists icp_match boolean not null default false;

create or replace function guard_lead_qualification() returns trigger as $$
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

drop trigger if exists leads_guard_qualification on leads;
create trigger leads_guard_qualification
  before update on leads
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function guard_lead_qualification();

-- ---------------------------------------------------------------------------
-- 4. CONTACTS — new fields for the standalone Contacts module
-- ---------------------------------------------------------------------------

alter table contacts
  add column if not exists mobile varchar(40) check (mobile is null or mobile ~ '^\+?[0-9]{10}$'),
  add column if not exists department varchar(120),
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 5. MERGE ACCOUNTS (companies) — admin/manager only. Repoints every
-- dependent row from source to target, then deletes the source account.
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
