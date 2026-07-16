-- Phase M2: free-text "Other" companion columns (Group 3 / A2). Run AFTER
-- phase-m1 (needs the OTHER value already committed). Purely additive
-- nullable text columns — safe as a single transaction.

alter table leads add column unqualified_reason_other text;
alter table lead_contacts add column role_other text;
alter table deal_contacts add column role_other text;
