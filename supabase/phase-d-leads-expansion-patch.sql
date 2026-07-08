-- Phase D patch: expand leads into a detailed, sectioned Quick Create /
-- Detailed Lead form — salutation, mobile, LinkedIn, source details, rating,
-- unqualified reason, email opt-in, tags, created-by, file attachments, and
-- Company/Address enrichment fields on `accounts` (postal_code, currency).
-- Also renames two `lead_stages` rows to match the new Lead Status labels.
--
-- IMPORTANT: the two ALTER TYPE ... ADD VALUE statements below must commit
-- before any later statement in this file references 'COLD_CALL' /
-- 'ADVERTISEMENT'. Do not wrap this file in an explicit begin/commit block.
-- Run top-to-bottom in one pass via `supabase db query --linked --file`,
-- same as phase-c-deal-expansion-patch.sql.

alter type lead_source add value if not exists 'COLD_CALL';
alter type lead_source add value if not exists 'ADVERTISEMENT';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type lead_rating as enum ('HOT', 'WARM', 'COLD');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_unqualified_reason as enum (
    'NO_BUDGET', 'NOT_A_FIT', 'NO_RESPONSE', 'COMPETITOR', 'BAD_DATA'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type salutation as enum ('MR', 'MS', 'MRS', 'DR', 'PROF');
exception when duplicate_object then null; end $$;

-- currency_code already exists (created in phase-c-deal-expansion-patch.sql)
-- — reused as-is for accounts.currency below, not recreated here.

-- ---------------------------------------------------------------------------
-- leads: new scalar columns
-- ---------------------------------------------------------------------------

alter table leads
  add column if not exists salutation salutation,
  add column if not exists mobile varchar(40)
    check (mobile is null or mobile ~ '^\+?[0-9]{10}$'),
  add column if not exists linkedin_url varchar(500)
    check (linkedin_url is null or linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.*$'),
  add column if not exists source_details varchar(255),
  add column if not exists rating lead_rating,
  add column if not exists unqualified_reason lead_unqualified_reason,
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists tags text[] not null default '{}';

create index if not exists leads_tags_idx on leads using gin(tags);
create index if not exists leads_created_by_idx on leads(created_by);
create index if not exists leads_rating_idx on leads(rating);

-- Bound the previously-dormant `score` column now that it becomes a
-- user-facing 0-100 field. Guarded with duplicate_object handling since
-- Postgres has no native `add constraint if not exists`.
do $$ begin
  alter table leads add constraint leads_score_range check (score between 0 and 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- accounts: postal_code (no such column existed) + currency (for annual
-- revenue, reusing the currency_code enum already created for deals).
-- ---------------------------------------------------------------------------

alter table accounts
  add column if not exists postal_code varchar(20),
  add column if not exists currency currency_code not null default 'USD';

-- ---------------------------------------------------------------------------
-- lead_stages: rename "Attempted Contact" -> "Working" and
-- "Disqualified" -> "Unqualified" to match the new spec's Lead Status
-- labels. Renaming in place (not adding new rows) preserves every existing
-- lead's stage_id FK and is_won/is_lost flags untouched. Idempotent: a
-- second run matches nothing since the old names no longer exist.
-- ---------------------------------------------------------------------------

update lead_stages set name = 'Working' where name = 'Attempted Contact';
update lead_stages set name = 'Unqualified' where name = 'Disqualified';

-- ---------------------------------------------------------------------------
-- lead_attachments: file metadata + Supabase Storage bucket. Structural
-- mirror of deal_attachments, swapping opportunity_id for lead_id.
-- ---------------------------------------------------------------------------

create table if not exists lead_attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  file_name varchar(255) not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type varchar(150) not null,
  uploaded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists lead_attachments_lead_id_idx on lead_attachments(lead_id);
create index if not exists lead_attachments_uploaded_by_idx on lead_attachments(uploaded_by);

alter table lead_attachments enable row level security;

drop policy if exists "lead_attachments_select" on lead_attachments;
create policy "lead_attachments_select" on lead_attachments for select to authenticated
  using (
    is_manager_or_admin()
    or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
  );

drop policy if exists "lead_attachments_insert" on lead_attachments;
create policy "lead_attachments_insert" on lead_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      is_manager_or_admin()
      or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
    )
  );

drop policy if exists "lead_attachments_delete" on lead_attachments;
create policy "lead_attachments_delete" on lead_attachments for delete to authenticated
  using (
    is_manager_or_admin()
    or uploaded_by = auth.uid()
    or exists (select 1 from leads l where l.id = lead_attachments.lead_id and l.owner_id = auth.uid())
  );

-- Storage bucket (private — access only via RLS-checked client calls).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-attachments', 'lead-attachments', false, 26214400,
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

drop policy if exists "lead_attachments_storage_select" on storage.objects;
create policy "lead_attachments_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );

drop policy if exists "lead_attachments_storage_insert" on storage.objects;
create policy "lead_attachments_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );

drop policy if exists "lead_attachments_storage_delete" on storage.objects;
create policy "lead_attachments_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from leads l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and (is_manager_or_admin() or l.owner_id = auth.uid())
    )
  );
