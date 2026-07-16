-- Phase L: Group 1 data-model changes (A1 configurable Lead Source,
-- A3 multi-owner co-owners, A4 socials, A5 Annual Revenue bands).
--
-- Safe to run as a SINGLE transaction/paste — unlike earlier phase patches,
-- nothing here is an `alter type ... add value` (which must run alone in
-- its own transaction). `lead_source` goes from an enum to a table, and
-- `revenue_band` is a brand-new enum type, not an add-value on an existing
-- one, so there's no cross-transaction visibility issue.

-- ============================================================================
-- A1: configurable Lead Source list (replaces the lead_source enum)
-- ============================================================================

create table lead_source_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  "order" int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into lead_source_options (name, "order") values
  ('Import', 1), ('Outreach', 2), ('Email', 3), ('Campaign', 4),
  ('Referral', 5), ('Website', 6), ('Social Media', 7), ('Event', 8),
  ('Partner', 9), ('Cold Call', 10), ('Advertisement', 11), ('Other', 12);

alter table leads add column source_id uuid references lead_source_options(id);

-- Backfill: match each lead's existing enum value to the option of the
-- same name (enum values are SCREAMING_SNAKE_CASE, e.g. COLD_CALL; option
-- names are display case, e.g. "Cold Call" — normalize both sides to compare).
update leads l
set source_id = o.id
from lead_source_options o
where upper(replace(o.name, ' ', '_')) = l.source::text;

-- Any lead whose source didn't match (shouldn't happen — enum and option
-- seed lists are 1:1) falls back to "Other" rather than being left null.
update leads set source_id = (select id from lead_source_options where name = 'Other')
where source_id is null;

alter table leads alter column source_id set not null;
alter table leads drop column source;

alter table lead_source_options enable row level security;

create policy "lead_source_options_select" on lead_source_options for select to authenticated
  using (true);

create policy "lead_source_options_write" on lead_source_options for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());

-- ============================================================================
-- A3: multi-owner — additive co-owners (primary owner_id is UNCHANGED,
-- still the only thing every existing owner_id = auth.uid() RLS policy
-- checks; this is purely additive/display, not a security-model change).
-- ============================================================================

create table lead_additional_owners (
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (lead_id, user_id)
);

create table opportunity_additional_owners (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (opportunity_id, user_id)
);

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

-- ============================================================================
-- A4: socials (LinkedIn/Instagram/Twitter + repeatable "other platform")
-- ============================================================================

alter table leads add column instagram_url text;
alter table leads add column twitter_url text;
alter table contacts add column linkedin_url text;
alter table contacts add column instagram_url text;
alter table contacts add column twitter_url text;

create table social_links (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  platform text not null,
  url text not null,
  "order" int not null default 1,
  created_at timestamptz not null default now(),
  constraint social_links_exactly_one_parent check (
    (lead_id is not null and contact_id is null) or (lead_id is null and contact_id is not null)
  )
);

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

-- ============================================================================
-- A5: Annual Revenue as a dropdown of bands (was numeric(15,2))
-- ============================================================================

create type revenue_band as enum ('LT_1CR', 'CR_1_10', 'CR_10_50', 'CR_50_100', 'CR_100_PLUS');

alter table accounts add column revenue_band revenue_band;

-- Lossy, one-way bucketing of existing numeric values (INR; 1 crore = 1e7).
-- Review these boundaries before running if your existing data uses a
-- different currency/scale — this assumes annual_revenue was entered in INR.
update accounts set revenue_band = case
  when annual_revenue is null then null
  when annual_revenue < 10000000 then 'LT_1CR'          -- < 1,00,00,000 (1 crore)
  when annual_revenue < 100000000 then 'CR_1_10'        -- 1-10 crore
  when annual_revenue < 500000000 then 'CR_10_50'       -- 10-50 crore
  when annual_revenue < 1000000000 then 'CR_50_100'     -- 50-100 crore
  else 'CR_100_PLUS'                                    -- 100+ crore
end::revenue_band;

alter table accounts drop column annual_revenue;
alter table accounts rename column revenue_band to annual_revenue;
