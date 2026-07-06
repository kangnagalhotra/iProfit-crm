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
    ('Lead',          1, '#025ADF', true,  10, false, false),
    ('Discovery',     2, '#6B7280', false, 20, false, false),
    ('Qualified',     3, '#8B5CF6', false, 35, false, false),
    ('Proposal',      4, '#F97316', false, 55, false, false),
    ('Negotiation',   5, '#F97316', false, 70, false, false),
    ('Verbal Commit', 6, '#F97316', false, 90, false, false),
    ('Won',           7, '#16A34A', false, 100, true, false),
    ('Lost',          8, '#DC2626', false, 0,  false, true)
  ) as s(name, ord, color, is_default, win_prob, won, lost)
where p.name = 'Sales Pipeline'
  and not exists (select 1 from deal_stages ds where ds.pipeline_id = p.id);

-- ---------------------------------------------------------------------------
-- Default account stages
-- ---------------------------------------------------------------------------

insert into account_stages (name, "order", color, is_default)
select * from (values
  ('Prospect',          1, '#025ADF'::stage_color, true),
  ('Qualified',         2, '#8B5CF6'::stage_color, false),
  ('Active Customer',   3, '#16A34A'::stage_color, false),
  ('Strategic Account', 4, '#F97316'::stage_color, false),
  ('On Hold',           5, '#6B7280'::stage_color, false),
  ('Inactive',          6, '#DC2626'::stage_color, false)
) as s(name, "order", color, is_default)
where not exists (select 1 from account_stages);

-- ---------------------------------------------------------------------------
-- Default lead stages
-- ---------------------------------------------------------------------------

insert into lead_stages (name, "order", color, is_default, is_won, is_lost)
select * from (values
  ('New',           1, '#025ADF'::stage_color, true,  false, false),
  ('Contacted',     2, '#6B7280'::stage_color, false, false, false),
  ('Qualified',     3, '#8B5CF6'::stage_color, false, false, false),
  ('Proposal Sent', 4, '#F97316'::stage_color, false, false, false),
  ('Negotiation',   5, '#F97316'::stage_color, false, false, false),
  ('Won',           6, '#16A34A'::stage_color, false, true,  false),
  ('Lost',          7, '#DC2626'::stage_color, false, false, true)
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
