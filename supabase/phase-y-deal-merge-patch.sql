-- Manual Deal merge (Section C): a deal merged away into a survivor stays
-- archived + retained for audit, never deleted — mirrors leads'
-- merged_into_opportunity_id (phase-x2) but self-referencing onto
-- opportunities. See mergeDeals() in frontend/src/api/deals.ts.

alter table opportunities add column if not exists merged_into_opportunity_id uuid references opportunities(id) on delete set null;
create index if not exists opportunities_merged_into_opportunity_id_idx on opportunities(merged_into_opportunity_id);
