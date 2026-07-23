-- Lead-side merge tracking for the duplicate-detection flow (Section B):
-- when a rep confirms a new Lead is a duplicate of an existing open Deal at
-- the same company, the Lead is marked merged (not deleted) and pointed at
-- the Deal it was merged into — mirrors the existing converted_at pattern
-- (see frontend/src/components/LeadDealDuplicateModal.tsx, mergeLeadIntoDeal()
-- in frontend/src/api/leads.ts).

alter table leads add column if not exists merged_at timestamptz;
alter table leads add column if not exists merged_into_opportunity_id uuid references opportunities(id) on delete set null;
create index if not exists leads_merged_into_opportunity_id_idx on leads(merged_into_opportunity_id);
