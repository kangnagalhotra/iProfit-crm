-- iProfit CRM — seed data, ported from backend/prisma/seed.ts.
--
-- Run this AFTER schema.sql + rls.sql, and AFTER creating the two users below
-- in Supabase Auth (Dashboard → Authentication → Add user, or the Admin API).
-- The `handle_new_auth_user` trigger (auth-trigger.sql) auto-creates their
-- `profiles` row on signup with role defaulted to SALES_REP; the UPDATE
-- statements below fix up the admin's role and both users' display names.
--
--   admin@iprofit.com  / (set your own password in the dashboard)
--   rep@iprofit.com    / (set your own password in the dashboard)
--
-- (Unlike the old seed.ts, this can't set a password for you — Supabase Auth
-- owns password hashing. See the Phase A summary for why.)

update profiles set full_name = 'Karamvir Rao', role = 'ADMIN'
  where id = (select id from auth.users where email = 'admin@iprofit.com');

update profiles set full_name = 'Harjot Singh', role = 'SALES_REP'
  where id = (select id from auth.users where email = 'rep@iprofit.com');

-- ---------------------------------------------------------------------------
-- Default pipeline + deal stages
-- ---------------------------------------------------------------------------

insert into pipelines (name, is_default)
select 'Sales Pipeline', true
where not exists (select 1 from pipelines where name = 'Sales Pipeline');

insert into deal_stages (pipeline_id, name, "order", color, is_default, win_probability, is_closed_won, is_closed_lost)
select p.id, s.name, s.ord, s.color, s.is_default, s.win_prob, s.won, s.lost
from pipelines p,
  (values
    ('Discovery',      1, '#025ADF', true,  20, false, false),
    ('Product Demo',   2, '#8B5CF6', false, 45, false, false),
    ('Proposal Sent',  3, '#F97316', false, 55, false, false),
    ('Negotiation',    4, '#F97316', false, 70, false, false),
    ('Closed Won',     5, '#16A34A', false, 100, true, false),
    ('Closed Lost',    6, '#DC2626', false, 0,  false, true)
  ) as s(name, ord, color, is_default, win_prob, won, lost)
where p.name = 'Sales Pipeline'
  and not exists (select 1 from deal_stages ds where ds.pipeline_id = p.id);

-- ---------------------------------------------------------------------------
-- Default account stages
-- ---------------------------------------------------------------------------

insert into account_stages (name, "order", color, is_default, is_customer_stage, is_inactive_stage)
select * from (values
  ('Lead',              1, '#025ADF'::stage_color, true,  false, false),
  ('Customer',          2, '#16A34A'::stage_color, false, true,  false),
  ('Strategic Account', 3, '#8B5CF6'::stage_color, false, true,  false),
  ('On Hold',           4, '#F97316'::stage_color, false, false, false),
  ('Inactive',          5, '#6B7280'::stage_color, false, false, true)
) as s(name, "order", color, is_default, is_customer_stage, is_inactive_stage)
where not exists (select 1 from account_stages);

-- ---------------------------------------------------------------------------
-- Default customer (post-sale) lifecycle stages
-- ---------------------------------------------------------------------------

insert into customer_stages (name, "order", color, is_default, is_renewed_stage)
select * from (values
  ('Onboarding',  1, '#025ADF'::stage_color, true,  false),
  ('Active',      2, '#16A34A'::stage_color, false, false),
  ('Renewal Due', 3, '#F97316'::stage_color, false, false),
  ('Renewed',     4, '#8B5CF6'::stage_color, false, true)
) as s(name, "order", color, is_default, is_renewed_stage)
where not exists (select 1 from customer_stages);

-- ---------------------------------------------------------------------------
-- Default lead stages
-- ---------------------------------------------------------------------------

insert into lead_stages (name, "order", color, is_default, is_won, is_lost)
select * from (values
  ('New',          1, '#025ADF'::stage_color, true,  false, false),
  ('Contacted',    2, '#6B7280'::stage_color, false, false, false),
  ('Working',      3, '#6B7280'::stage_color, false, false, false),
  ('Qualified',    4, '#16A34A'::stage_color, false, true,  false),
  ('Unqualified',  5, '#DC2626'::stage_color, false, false, true)
) as s(name, "order", color, is_default, is_won, is_lost)
where not exists (select 1 from lead_stages);

-- ---------------------------------------------------------------------------
-- Sample account + lead (matches seed.ts's demo data)
-- ---------------------------------------------------------------------------

insert into accounts (name, domain, industry, stage_id, owner_id)
select 'Acme Foods', 'acmefoods.com', 'Food & Beverage',
  (select id from account_stages where is_default limit 1),
  (select id from auth.users where email = 'admin@iprofit.com')
where not exists (select 1 from accounts where domain = 'acmefoods.com');

insert into leads (first_name, last_name, email, stage_id, source, owner_id, account_id, last_activity_at)
select 'Maria', 'Johnson', 'maria@acmefoods.com',
  (select id from lead_stages where is_default limit 1),
  'OUTREACH',
  (select id from auth.users where email = 'rep@iprofit.com'),
  (select id from accounts where domain = 'acmefoods.com'),
  now()
where not exists (select 1 from leads where email = 'maria@acmefoods.com');
