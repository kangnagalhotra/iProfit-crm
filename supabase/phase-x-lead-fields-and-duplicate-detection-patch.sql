-- Lead Department/Division + Product Interest, Contact Location — needed so
-- duplicate-lead detection (frontend/src/components/LeadDealDuplicateModal.tsx)
-- has "same company + same product + same department" to compare against.
-- Lead Location reuses the already-existing (previously unused) leads.city
-- column — no schema change needed for that field.

alter table leads add column if not exists department varchar(120);
alter table leads add column if not exists product_interest_id uuid references products(id) on delete set null;
create index if not exists leads_product_interest_id_idx on leads(product_interest_id);

alter table contacts add column if not exists location varchar(120);
