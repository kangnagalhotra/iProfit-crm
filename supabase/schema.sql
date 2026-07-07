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

create type lead_source as enum (
  'IMPORT', 'OUTREACH', 'EMAIL', 'CAMPAIGN', 'REFERRAL', 'WEBSITE',
  'SOCIAL_MEDIA', 'EVENT', 'PARTNER', 'OTHER'
);

create type activity_type as enum ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'FIELD_UPDATE');

create type task_type as enum ('TODO', 'CALL', 'EMAIL', 'FOLLOW_UP');

create type task_status as enum ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED');

create type task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

create type deal_type as enum ('NEW_BUSINESS', 'EXISTING_BUSINESS', 'RENEWAL');

create type notification_type as enum (
  'RECORD_ASSIGNED', 'TASK_DUE', 'STAGE_CHANGED', 'MENTION', 'LEAD_INACTIVE', 'DEAL_INACTIVE'
);

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
  created_at timestamptz not null default now()
);
create index account_stages_order_idx on account_stages("order");

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  domain varchar(255),
  industry varchar(120),
  size_bucket varchar(40),
  annual_revenue numeric(15, 2) check (annual_revenue is null or annual_revenue >= 0),
  city varchar(120),
  state varchar(120),
  country varchar(120),
  company_type varchar(80),
  email varchar(255) check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone varchar(40) check (phone is null or phone ~ '^\+?[0-9]{10}$'),
  address varchar(255),
  description text,
  stage_id uuid not null references account_stages(id) on delete restrict,
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_domain_idx on accounts(domain);
create index accounts_owner_id_idx on accounts(owner_id);
create index accounts_stage_id_idx on accounts(stage_id);
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

create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_name varchar(200),
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone varchar(40) check (phone is null or phone ~ '^\+?[0-9]{10}$'),
  job_title varchar(150),
  city varchar(120),
  value numeric(15, 2) check (value is null or value >= 0),
  notes text,
  stage_id uuid not null references lead_stages(id) on delete restrict,
  source lead_source not null default 'OTHER',
  score int not null default 0,
  owner_id uuid references profiles(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  last_activity_at timestamptz,
  -- BANT qualification (Budget/Authority/Need/Timeline), each 0-10; shown as
  -- a summed score out of 40 on the Lead Qualification card.
  budget_score smallint check (budget_score is null or budget_score between 0 and 10),
  authority_score smallint check (authority_score is null or authority_score between 0 and 10),
  need_score smallint check (need_score is null or need_score between 0 and 10),
  timeline_score smallint check (timeline_score is null or timeline_score between 0 and 10),
  qualification_notes text,
  -- Set once, on conversion — the authoritative "is this lead converted"
  -- flag, orthogonal to stage (mirrors Salesforce's IsConverted, not a status
  -- value) so a converted lead keeps showing "Qualified" as its stage.
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_id_idx on leads(owner_id);
create index leads_stage_id_idx on leads(stage_id);
create index leads_last_activity_at_idx on leads(last_activity_at);
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
  job_title varchar(150),
  account_id uuid references accounts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null, -- lineage: which Lead this was converted from, if any
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_account_id_idx on contacts(account_id);
create index contacts_owner_id_idx on contacts(owner_id);
create trigger contacts_set_updated_at before update on contacts
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_owner_id_idx on opportunities(owner_id);
create index opportunities_stage_id_idx on opportunities(stage_id);
create index opportunities_pipeline_id_idx on opportunities(pipeline_id);
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

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
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_id_idx on tasks(assignee_id);
create index tasks_due_at_idx on tasks(due_at);
create index tasks_status_idx on tasks(status);
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

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
insert into assignment_state (id, last_user_id) values (true, null);
