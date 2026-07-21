-- iProfit CRM — Postgres schema for Supabase
-- Ported from backend/prisma/schema.prisma (MySQL). Phase A of the Supabase migration.
--
-- Naming: snake_case throughout (Postgres/Supabase convention), vs. the old
-- Prisma schema's camelCase. Table names are the old PascalCase model names,
-- lowercased and pluralized/snake_cased (Stage -> deal_stages, for clarity
-- alongside lead_stages/account_stages).
--
-- Users: Supabase Auth owns auth.users (id, email, password). `profiles` holds
-- everything else the old `User` model had (full_name, role, etc.), keyed 1:1
-- by the same id. There is no passwordHash/failedLoginCount/lockedUntil here —
-- Supabase Auth manages authentication and brute-force protection itself.
--
-- Validation that used to live in NestJS DTOs (phone format, non-negative
-- values, stage color allowlist) is now enforced via CHECK constraints, since
-- there's no application layer left to enforce it.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

create type role as enum ('ADMIN', 'SALES_MANAGER', 'SALES_REP');

-- Lead Source used to be a fixed enum here; it's now the admin-configurable
-- lead_source_options table (see below), so leads.source_id is a plain FK.

create type lead_rating as enum ('HOT', 'WARM', 'COLD');

-- Annual Revenue band, replacing a free numeric input (Group 1 / A5).
create type revenue_band as enum ('LT_1CR', 'CR_1_10', 'CR_10_50', 'CR_50_100', 'CR_100_PLUS');

create type lead_unqualified_reason as enum (
  'NO_BUDGET', 'NOT_A_FIT', 'NO_RESPONSE', 'COMPETITOR', 'BAD_DATA', 'OTHER'
);

create type salutation as enum ('MR', 'MS', 'MRS', 'DR', 'PROF');

create type activity_type as enum ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'FIELD_UPDATE');

create type task_type as enum ('TODO', 'CALL', 'EMAIL', 'FOLLOW_UP', 'MEETING');

create type task_status as enum ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED');

create type task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

create type deal_type as enum ('NEW_BUSINESS', 'EXISTING_BUSINESS', 'RENEWAL', 'UPSELL');

create type deal_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

create type currency_code as enum ('USD', 'EUR', 'GBP', 'INR');

create type deal_contact_role as enum ('CHAMPION', 'DECISION_MAKER', 'INFLUENCER', 'BLOCKER', 'OTHER');

-- Forecast category is deliberately separate from stage win-probability:
-- null on a deal means "derive from stage"; a stored value is a rep override
-- (with forecast_justification required by the UI when more optimistic).
create type forecast_category as enum ('COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITTED');

create type deal_decision_timeframe as enum (
  'LESS_THAN_1_MONTH', 'ONE_TO_3_MONTHS', 'THREE_TO_6_MONTHS', 'SIX_PLUS_MONTHS'
);

create type notification_type as enum (
  'RECORD_ASSIGNED', 'TASK_DUE', 'STAGE_CHANGED', 'MENTION', 'LEAD_INACTIVE', 'DEAL_INACTIVE', 'ACCOUNT_INACTIVE'
);

create type ticket_status as enum ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- Deliberately not a reuse of task_priority: ticket SLA semantics are expected
-- to diverge from task semantics over time, and splitting a shared enum later
-- is far more disruptive than keeping two small enums in sync today.
create type ticket_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- 'BOTH' lets a single catalog entry serve both sectors instead of forking
-- into two parallel product lists — sector drives filtering/reporting only.
create type product_sector as enum ('PRIVATE', 'GOVERNMENT', 'BOTH');

-- Shared allowlist for all three stage tables' `color` column (see CRM
-- Enhancements work: Blue/Green/Purple/Orange/Red/Gray only, going forward).
create domain stage_color as varchar(20)
  check (value in ('#025ADF', '#16A34A', '#8B5CF6', '#F97316', '#DC2626', '#6B7280'));

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Strips protocol/www/path/trailing-slash and lowercases, so "https://www.
-- WeExcel.com/about" and "weexcel.com" resolve to the same company —
-- backs the hard uniqueness constraint on accounts.domain_normalized below.
create function normalize_domain(input text) returns text as $$
  select case when input is null or trim(input) = '' then null else
    lower(regexp_replace(regexp_replace(regexp_replace(trim(input), '^https?://', ''), '^www\.', ''), '/.*$', ''))
  end;
$$ language sql immutable;

-- ---------------------------------------------------------------------------
-- PROFILES (extends auth.users)
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email varchar(255) not null unique,
  full_name varchar(200) not null,
  role role not null default 'SALES_REP',
  is_active boolean not null default true,
  in_assignment_pool boolean not null default true,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on profiles(role);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- ACCOUNT STAGES / ACCOUNTS
-- ---------------------------------------------------------------------------

create table account_stages (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  "order" int not null,
  color stage_color not null,
  is_default boolean not null default false,
  is_customer_stage boolean not null default false,
  is_inactive_stage boolean not null default false,
  created_at timestamptz not null default now()
);
create index account_stages_order_idx on account_stages("order");

create table customer_stages (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  "order" int not null,
  color stage_color not null,
  is_default boolean not null default false,
  is_renewed_stage boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_stages_order_idx on customer_stages("order");

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  domain varchar(255),
  domain_normalized text generated always as (normalize_domain(domain)) stored,
  industry varchar(120),
  size_bucket varchar(40),
  annual_revenue revenue_band,
  city varchar(120),
  state varchar(120),
  country varchar(120),
  email varchar(255) check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone varchar(40) check (phone is null or phone ~ '^\+?[0-9]{10}$'),
  address varchar(255),
  postal_code varchar(20),
  currency currency_code not null default 'USD',
  description text,
  stage_id uuid not null references account_stages(id) on delete restrict,
  owner_id uuid references profiles(id) on delete set null,
  customer_stage_id uuid references customer_stages(id) on delete set null,
  last_inactivity_alert_at timestamptz, -- last time the 180-day-inactive alert fired; null until the first one
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_domain_idx on accounts(domain);
-- Company dedup: hard-blocks a second company with the same normalized
-- domain (any URL format) at insert/update time.
create unique index accounts_domain_normalized_uidx on accounts(domain_normalized) where domain_normalized is not null;
create index accounts_owner_id_idx on accounts(owner_id);
create index accounts_stage_id_idx on accounts(stage_id);
create index accounts_customer_stage_id_idx on accounts(customer_stage_id);
create trigger accounts_set_updated_at before update on accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- LEAD STAGES / LEADS
-- ---------------------------------------------------------------------------

create table lead_stages (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  "order" int not null,
  color stage_color not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index lead_stages_order_idx on lead_stages("order");

-- Admin-configurable Lead Source list (Group 1 / A1) — mirrors the stages
-- tables' pattern (a real table + CRUD) instead of a fixed enum, so admins
-- can add/rename/reorder/retire values without a code change.
create table lead_source_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  "order" int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_name varchar(200),
  salutation salutation,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone varchar(40) check (phone is null or phone ~ '^\+?[0-9]{10}$'),
  mobile varchar(40) check (mobile is null or mobile ~ '^\+?[0-9]{10}$'),
  job_title varchar(150),
  linkedin_url varchar(500) check (linkedin_url is null or linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.*$'),
  instagram_url varchar(500),
  twitter_url varchar(500),
  city varchar(120),
  value numeric(15, 2) check (value is null or value >= 0),
  notes text,
  stage_id uuid not null references lead_stages(id) on delete restrict,
  source_id uuid not null references lead_source_options(id),
  source_details varchar(255),
  score int not null default 0 check (score between 0 and 100),
  rating lead_rating,
  unqualified_reason lead_unqualified_reason,
  unqualified_reason_other text,
  email_opt_in boolean not null default true,
  tags text[] not null default '{}',
  owner_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  last_activity_at timestamptz,
  -- BANT qualification (Budget/Authority/Need/Timeline), each 0-10; shown as
  -- a summed score out of 40 on the Lead Qualification card. Separate and
  -- unrelated to the 0-100 `score` column above (computed engagement score —
  -- see refresh_engagement_on_activity()/recompute_engagement_scores() in
  -- triggers.sql, never hand-edited — BANT/ICP fit only feeds into it as
  -- one weighted component, see compute_lead_score()).
  budget_score smallint check (budget_score is null or budget_score between 0 and 10),
  authority_score smallint check (authority_score is null or authority_score between 0 and 10),
  need_score smallint check (need_score is null or need_score between 0 and 10),
  timeline_score smallint check (timeline_score is null or timeline_score between 0 and 10),
  qualification_notes text,
  -- MQL gate: must be true (alongside budget_score/authority_score being
  -- filled in) before a lead can enter a "won" (Qualified) stage — enforced
  -- by the guard_lead_qualification() trigger in triggers.sql, not just the UI.
  icp_match boolean not null default false,
  -- Set once, on conversion — the authoritative "is this lead converted"
  -- flag, orthogonal to stage (mirrors Salesforce's IsConverted, not a status
  -- value) so a converted lead keeps showing "Qualified" as its stage.
  converted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_id_idx on leads(owner_id);
create index leads_stage_id_idx on leads(stage_id);
create index leads_last_activity_at_idx on leads(last_activity_at);
create index leads_created_by_idx on leads(created_by);
create index leads_rating_idx on leads(rating);
create index leads_tags_idx on leads using gin(tags);
create trigger leads_set_updated_at before update on leads
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- CONTACTS (person records, distinct from Lead — created on Lead conversion)
-- ---------------------------------------------------------------------------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone varchar(40) check (phone is null or phone ~ '^\+?[0-9]{10}$'),
  mobile varchar(40) check (mobile is null or mobile ~ '^\+?[0-9]{10}$'),
  job_title varchar(150), -- shown as "Designation" in the Contacts UI
  department varchar(120),
  linkedin_url varchar(500),
  instagram_url varchar(500),
  twitter_url varchar(500),
  notes text,
  -- Every Contact belongs to exactly one Company and has an internal owner —
  -- enforced here, not just in the UI. lead_id is legacy (superseded by the
  -- lead_contacts many-to-many table below) and stays nullable/unused.
  account_id uuid not null references accounts(id) on delete restrict,
  lead_id uuid references leads(id) on delete set null,
  owner_id uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_account_id_idx on contacts(account_id);
create index contacts_owner_id_idx on contacts(owner_id);
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();

-- Lead <-> Contact many-to-many: a Lead can have multiple Contacts and a
-- Contact can be associated with multiple Leads (e.g. multiple stakeholders
-- from the same opportunity, or one stakeholder involved in two deals).
create table lead_contacts (
  lead_id uuid not null references leads(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role deal_contact_role not null default 'OTHER',
  role_other text,
  created_at timestamptz not null default now(),
  primary key (lead_id, contact_id)
);
create index lead_contacts_contact_id_idx on lead_contacts(contact_id);

-- ---------------------------------------------------------------------------
-- SUPPORT TICKETS
-- ---------------------------------------------------------------------------

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  subject varchar(250) not null,
  description text,
  status ticket_status not null default 'OPEN',
  priority ticket_priority not null default 'MEDIUM',
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  assignee_id uuid references profiles(id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_account_id_idx on support_tickets(account_id);
create index support_tickets_assignee_id_idx on support_tickets(assignee_id);
create index support_tickets_status_idx on support_tickets(status);
create trigger support_tickets_set_updated_at before update on support_tickets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- PIPELINES / DEAL STAGES / OPPORTUNITIES (DEALS)
-- ---------------------------------------------------------------------------

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table deal_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete restrict,
  name varchar(100) not null,
  "order" int not null,
  color stage_color not null,
  is_default boolean not null default false,
  win_probability int not null default 0 check (win_probability between 0 and 100),
  is_closed_won boolean not null default false,
  is_closed_lost boolean not null default false
);
create index deal_stages_pipeline_id_idx on deal_stages(pipeline_id);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  amount numeric(15, 2) check (amount is null or amount >= 0),
  close_date timestamptz,
  deal_type deal_type not null default 'NEW_BUSINESS',
  priority deal_priority not null default 'MEDIUM',
  description text,
  source varchar(80),
  pipeline_id uuid not null references pipelines(id) on delete restrict,
  stage_id uuid not null references deal_stages(id) on delete restrict,
  owner_id uuid not null references profiles(id) on delete restrict,
  account_id uuid references accounts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  loss_reason varchar(255),
  closed_at timestamptz,
  last_inactivity_alert_at timestamptz, -- last time the 7-day-inactive alert fired; null until the first one
  archived_at timestamptz,
  currency currency_code not null default 'USD',
  probability_override int check (probability_override is null or probability_override between 0 and 100), -- null = inherit deal_stages.win_probability
  next_step varchar(250),
  next_activity_date timestamptz,
  competitor varchar(150),
  budget_confirmed boolean,
  decision_timeframe deal_decision_timeframe,
  pain_point text,
  tags text[] not null default '{}',
  partner_account_id uuid references accounts(id) on delete set null,
  -- Forecasting: null forecast_category = derive from stage; override needs
  -- justification (UI-enforced) when more optimistic than the derived value.
  forecast_category forecast_category,
  forecast_justification text,
  -- null = auto-calculated (Value x Probability); set = rep/manager override.
  expected_revenue numeric(15, 2) check (expected_revenue is null or expected_revenue >= 0),
  -- Engagement scoring (computed — see refresh_engagement_on_activity()
  -- and recompute_engagement_scores() in triggers.sql, never hand-edited).
  score int not null default 0 check (score between 0 and 100),
  last_activity_at timestamptz,
  -- Renewal automation (check_renewals() cron in triggers.sql).
  renewal_date date,
  last_renewal_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_owner_id_idx on opportunities(owner_id);
create index opportunities_stage_id_idx on opportunities(stage_id);
create index opportunities_pipeline_id_idx on opportunities(pipeline_id);
create index opportunities_partner_account_id_idx on opportunities(partner_account_id);
create index opportunities_tags_idx on opportunities using gin(tags);
create index opportunities_next_activity_date_idx on opportunities(next_activity_date);
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

-- Additional contacts on a deal, each tagged with a role. The single
-- opportunities.contact_id above stays as "Primary Contact" — orthogonal.
create table deal_contacts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role deal_contact_role not null,
  role_other text,
  created_at timestamptz not null default now(),
  unique (opportunity_id, contact_id)
);
create index deal_contacts_opportunity_id_idx on deal_contacts(opportunity_id);
create index deal_contacts_contact_id_idx on deal_contacts(contact_id);

-- Additive co-owners (Group 1 / A3). The single owner_id column on leads/
-- opportunities is UNCHANGED and stays the only thing RLS gates on — these
-- tables are purely additive/display, for "who else is working this deal".
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

-- Socials (Group 1 / A4): LinkedIn/Instagram/Twitter live as named columns
-- on leads/contacts directly; anything beyond those three platforms goes
-- here as a repeatable platform+url row.
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
create index social_links_lead_id_idx on social_links(lead_id);
create index social_links_contact_id_idx on social_links(contact_id);

-- Single product catalog (one list, not forked per sector — see
-- product_sector above). Line items below may optionally link to a catalog
-- entry; product_name stays free-text so ad hoc rows are still allowed.
create table products (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  sku varchar(80) unique,
  category varchar(120),
  sector product_sector not null default 'BOTH',
  unit_price numeric(15, 2) not null default 0 check (unit_price >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_sector_idx on products(sector);
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

-- Repeatable product/qty/price rows. No trigger syncs the sum into
-- opportunities.amount — that's a frontend-only convenience so Value stays
-- independently overridable.
create table deal_line_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name varchar(200) not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(15, 2) not null default 0 check (unit_price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deal_line_items_opportunity_id_idx on deal_line_items(opportunity_id);
create trigger deal_line_items_set_updated_at before update on deal_line_items
  for each row execute function set_updated_at();

create table deal_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  file_name varchar(255) not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type varchar(150) not null,
  uploaded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index deal_attachments_opportunity_id_idx on deal_attachments(opportunity_id);
create index deal_attachments_uploaded_by_idx on deal_attachments(uploaded_by);

create table lead_attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  file_name varchar(255) not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type varchar(150) not null,
  uploaded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index lead_attachments_lead_id_idx on lead_attachments(lead_id);
create index lead_attachments_uploaded_by_idx on lead_attachments(uploaded_by);

-- Versioned proposals/quotes — one row per version sent, never overwritten,
-- so "how the offer evolved" and proposal→close timing stay reportable.
-- Standard Proposal Template (Group 5 / F2) — a single {{placeholder}}
-- text block substituted client-side, not a rich-text engine; ships with
-- one default row, structured for more templates later.
-- `kind = 'WIZARD'` marks a richer, multi-section template (the actual
-- section/field schema for those lives in frontend/src/utils/
-- proposalWizardSchema.ts, not the DB) alongside the plain-text 'TEXT' kind.
create table proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  -- 'EXTERNAL' body holds an imported third-party form URL (Typeform,
  -- Google Forms, etc.) — see phase-r-external-proposal-form-patch.sql.
  kind text not null default 'TEXT' check (kind in ('TEXT', 'WIZARD', 'EXTERNAL')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table deal_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  version int not null,
  sent_date date not null,
  value numeric(15, 2) check (value is null or value >= 0),
  notes text,
  template_id uuid references proposal_templates(id) on delete set null,
  -- Full wizard submission (9-section content), null for simple/free-text
  -- proposal versions.
  content jsonb,
  created_at timestamptz not null default now(),
  unique (opportunity_id, version)
);
create index deal_proposals_opportunity_id_idx on deal_proposals(opportunity_id);

-- Activity-based stage advancement rules. Evaluated CLIENT-side after an
-- activity is logged (so the rep gets a toast with Undo — never a silent
-- server-side flip); this table is just the manager-editable config.
create table stage_automation_rules (
  id uuid primary key default gen_random_uuid(),
  from_stage_id uuid not null references deal_stages(id) on delete cascade,
  to_stage_id uuid not null references deal_stages(id) on delete cascade,
  requires_activity_type activity_type not null,
  requires_field varchar(60), -- optional: this opportunities column must be non-null (amount / next_step / close_date)
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by_id uuid not null references profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create index stage_history_opportunity_id_idx on stage_history(opportunity_id);

-- ---------------------------------------------------------------------------
-- PROJECTS — automatic Closed Won handover. One row per opportunity, created
-- exclusively by create_project_on_closed_won() (triggers.sql), never by a
-- client insert. Company/Value/Contacts are read through opportunity_id
-- rather than duplicated here.
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  opportunity_id uuid not null unique references opportunities(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  value numeric(15, 2),
  status varchar(30) not null default 'HANDOVER_PENDING',
  -- Post-sale client health (maintained by the deal owner / managers).
  health varchar(20) not null default 'ON_TRACK' check (health in ('ON_TRACK', 'AT_RISK', 'DELAYED')),
  satisfaction smallint check (satisfaction is null or satisfaction between 1 and 5),
  created_at timestamptz not null default now()
);
create index projects_account_id_idx on projects(account_id);

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title varchar(250) not null,
  type task_type not null default 'TODO',
  status task_status not null default 'NOT_STARTED',
  priority task_priority not null default 'MEDIUM',
  due_at timestamptz not null,
  notes text,
  reminder_at timestamptz,
  assignee_id uuid not null references profiles(id) on delete restrict,
  lead_id uuid references leads(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  -- contact_id / created_via: Phase S (quick-action logging unification) —
  -- lets a task be linked to a bare Contact (not just Lead/Deal/Company) and
  -- distinguishes reps who log via the quick-action shortcuts from manual
  -- task creation, for reporting.
  contact_id uuid references contacts(id) on delete set null,
  created_via text not null default 'MANUAL' check (created_via in ('MANUAL', 'QUICK_ACTION')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_id_idx on tasks(assignee_id);
create index tasks_due_at_idx on tasks(due_at);
create index tasks_status_idx on tasks(status);
create index tasks_contact_id_idx on tasks(contact_id);
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

-- Sub-tasks (checklist-style, Group 6 / G3) — lightweight checklist items
-- under a task, not full nested tasks (no assignee/due date/reminder of
-- their own; those stay on the parent task).
create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  "order" int not null default 1,
  created_at timestamptz not null default now()
);
create index task_checklist_items_task_id_idx on task_checklist_items(task_id);

-- ---------------------------------------------------------------------------
-- ACTIVITIES (notes, calls, emails, meetings, field-update log)
-- ---------------------------------------------------------------------------

create table activities (
  id uuid primary key default gen_random_uuid(),
  type activity_type not null,
  body text not null,
  meta jsonb,
  occurred_at timestamptz not null default now(),
  creator_id uuid not null references profiles(id) on delete restrict,
  lead_id uuid references leads(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index activities_lead_id_idx on activities(lead_id);
create index activities_opportunity_id_idx on activities(opportunity_id);
create index activities_task_id_idx on activities(task_id);
create index activities_creator_id_idx on activities(creator_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  message varchar(500) not null,
  link_url varchar(500),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_id_is_read_idx on notifications(user_id, is_read);

-- ---------------------------------------------------------------------------
-- ASSIGNMENT STATE (persistent round-robin cursor — replaces the old
-- in-memory `lastIndex` in assignment.service.ts, which reset on every
-- backend restart)
-- ---------------------------------------------------------------------------

create table assignment_state (
  id boolean primary key default true check (id), -- singleton row
  last_user_id uuid references profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- AI ASSIST LOG (Phase T) — backs both the ai-assist Edge Function's rate
-- limit (count recent rows per user) and its usage log. Written only by the
-- function's service-role client.
-- ---------------------------------------------------------------------------

create table ai_assist_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null check (action in ('summarize', 'followup', 'nextstep')),
  lead_id uuid references leads(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_assist_log_user_id_created_at_idx on ai_assist_log(user_id, created_at);

-- ---------------------------------------------------------------------------
-- STORAGE — deal attachments (private bucket; access via RLS on
-- storage.objects, see rls.sql). Path convention: {opportunity_id}/{uuid}-{filename}.
-- ---------------------------------------------------------------------------

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

insert into assignment_state (id, last_user_id) values (true, null);
