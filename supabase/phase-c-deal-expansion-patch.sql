-- Phase C patch: expand deals into a detailed, sectioned Create/Edit Deal
-- form — currency, per-deal probability override, sales-process fields,
-- qualification fields, tags, additional contacts with roles, line items,
-- and file attachments. Also activates the `stage_history` table, which
-- existed in the base schema but was never written to (see comment above
-- its original `alter table ... enable row level security` in rls.sql).
--
-- IMPORTANT: statement 1 below (ALTER TYPE ... ADD VALUE) must commit before
-- any later statement in this file references 'UPSELL'. Do not wrap this
-- file in an explicit begin/commit block. Run top-to-bottom in one pass via
-- `supabase db query --linked --file` (or the SQL Editor), same as
-- phase-b-patch.sql.

alter type deal_type add value if not exists 'UPSELL';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type currency_code as enum ('USD', 'EUR', 'GBP', 'INR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_contact_role as enum ('CHAMPION', 'DECISION_MAKER', 'INFLUENCER', 'BLOCKER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_decision_timeframe as enum (
    'LESS_THAN_1_MONTH', 'ONE_TO_3_MONTHS', 'THREE_TO_6_MONTHS', 'SIX_PLUS_MONTHS'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- opportunities: new scalar columns
-- ---------------------------------------------------------------------------

alter table opportunities
  add column if not exists currency currency_code not null default 'USD',
  add column if not exists probability_override int
    check (probability_override is null or probability_override between 0 and 100),
  add column if not exists next_step varchar(250),
  add column if not exists next_activity_date timestamptz,
  add column if not exists competitor varchar(150),
  add column if not exists budget_confirmed boolean,
  add column if not exists decision_timeframe deal_decision_timeframe,
  add column if not exists pain_point text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists partner_account_id uuid references accounts(id) on delete set null;

create index if not exists opportunities_partner_account_id_idx on opportunities(partner_account_id);
create index if not exists opportunities_tags_idx on opportunities using gin(tags);
create index if not exists opportunities_next_activity_date_idx on opportunities(next_activity_date);

-- ---------------------------------------------------------------------------
-- deal_contacts: additional contacts on a deal, each tagged with a role.
-- The existing single opportunities.contact_id stays as "Primary Contact",
-- untouched and orthogonal to this table.
-- ---------------------------------------------------------------------------

create table if not exists deal_contacts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role deal_contact_role not null,
  created_at timestamptz not null default now(),
  unique (opportunity_id, contact_id)
);
create index if not exists deal_contacts_opportunity_id_idx on deal_contacts(opportunity_id);
create index if not exists deal_contacts_contact_id_idx on deal_contacts(contact_id);

alter table deal_contacts enable row level security;

drop policy if exists "deal_contacts_select" on deal_contacts;
create policy "deal_contacts_select" on deal_contacts for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_contacts_insert" on deal_contacts;
create policy "deal_contacts_insert" on deal_contacts for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_contacts_update" on deal_contacts;
create policy "deal_contacts_update" on deal_contacts for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_contacts_delete" on deal_contacts;
create policy "deal_contacts_delete" on deal_contacts for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_contacts.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- deal_line_items: repeatable product/qty/price rows. No trigger syncs the
-- sum into opportunities.amount — that's a deliberate one-way, frontend-only
-- convenience so "Value stays independently overridable" always holds.
-- ---------------------------------------------------------------------------

create table if not exists deal_line_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  product_name varchar(200) not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(15, 2) not null default 0 check (unit_price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deal_line_items_opportunity_id_idx on deal_line_items(opportunity_id);
create trigger deal_line_items_set_updated_at before update on deal_line_items
  for each row execute function set_updated_at();

alter table deal_line_items enable row level security;

drop policy if exists "deal_line_items_select" on deal_line_items;
create policy "deal_line_items_select" on deal_line_items for select to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_line_items_insert" on deal_line_items;
create policy "deal_line_items_insert" on deal_line_items for insert to authenticated
  with check (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_line_items_update" on deal_line_items;
create policy "deal_line_items_update" on deal_line_items for update to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

drop policy if exists "deal_line_items_delete" on deal_line_items;
create policy "deal_line_items_delete" on deal_line_items for delete to authenticated
  using (exists (
    select 1 from opportunities o where o.id = deal_line_items.opportunity_id
      and (is_manager_or_admin() or o.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Activate stage_history (table already exists in base schema, RLS enabled
-- but had zero policies — fully inaccessible until now). Deliberately a
-- separate trigger from log_opportunity_changes() (which writes a human-
-- readable FIELD_UPDATE activity) — this is the structured, queryable twin,
-- consumed by the Deal Detail page's "Days in Stage" / "Stage History" UI.
-- ---------------------------------------------------------------------------

create or replace function log_stage_history() returns trigger as $$
begin
  insert into stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  values (new.id, old.stage_id, new.stage_id, coalesce(auth.uid(), new.owner_id), now());
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists opportunities_log_stage_history on opportunities;
create trigger opportunities_log_stage_history
  after update on opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function log_stage_history();

-- Also seed the initial "entered stage" row on creation (not just on later
-- changes), so "days in current stage" resolves for brand-new deals too.
create or replace function log_stage_history_on_insert() returns trigger as $$
begin
  insert into stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  values (new.id, null, new.stage_id, coalesce(auth.uid(), new.owner_id), new.created_at);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists opportunities_log_stage_history_insert on opportunities;
create trigger opportunities_log_stage_history_insert
  after insert on opportunities
  for each row
  execute function log_stage_history_on_insert();

-- Backfill: give every existing deal a synthetic "initial stage" row so
-- "days in current stage" always resolves, even for deals that predate this
-- trigger and have never changed stage since creation.
insert into stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
select o.id, null, o.stage_id, o.owner_id, o.created_at
from opportunities o
where not exists (select 1 from stage_history sh where sh.opportunity_id = o.id);

drop policy if exists "stage_history_select" on stage_history;
create policy "stage_history_select" on stage_history for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = stage_history.opportunity_id and o.owner_id = auth.uid())
  );

-- No insert/update/delete policy for the authenticated role: rows are
-- written exclusively by the security definer trigger above.

-- ---------------------------------------------------------------------------
-- deal_attachments: file metadata + Supabase Storage bucket.
-- ---------------------------------------------------------------------------

create table if not exists deal_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  file_name varchar(255) not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type varchar(150) not null,
  uploaded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists deal_attachments_opportunity_id_idx on deal_attachments(opportunity_id);
create index if not exists deal_attachments_uploaded_by_idx on deal_attachments(uploaded_by);

alter table deal_attachments enable row level security;

drop policy if exists "deal_attachments_select" on deal_attachments;
create policy "deal_attachments_select" on deal_attachments for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
  );

drop policy if exists "deal_attachments_insert" on deal_attachments;
create policy "deal_attachments_insert" on deal_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      is_manager_or_admin()
      or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
    )
  );

drop policy if exists "deal_attachments_delete" on deal_attachments;
create policy "deal_attachments_delete" on deal_attachments for delete to authenticated
  using (
    is_manager_or_admin()
    or uploaded_by = auth.uid()
    or exists (select 1 from opportunities o where o.id = deal_attachments.opportunity_id and o.owner_id = auth.uid())
  );

-- Storage bucket (private — access only via RLS-checked client calls).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-attachments', 'deal-attachments', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do nothing;

drop policy if exists "deal_attachments_storage_select" on storage.objects;
create policy "deal_attachments_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );

drop policy if exists "deal_attachments_storage_insert" on storage.objects;
create policy "deal_attachments_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );

drop policy if exists "deal_attachments_storage_delete" on storage.objects;
create policy "deal_attachments_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'deal-attachments'
    and exists (
      select 1 from opportunities o
      where o.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or o.owner_id = auth.uid())
    )
  );
