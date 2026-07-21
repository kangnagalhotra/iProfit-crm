-- Phase T: AI Assistant (Summarize / Draft follow-up / Suggest next step) on
-- Deal and Lead detail pages. This table backs both the rate limit (count
-- recent rows per user) and the usage log (requirement 6 & 7) — no separate
-- counter mechanism. Written only by the ai-assist Edge Function's
-- service-role client, same "no insert policy for authenticated" pattern as
-- assignment_state.
--
-- Safe as a single transaction — no enum ADD VALUE here.

create table ai_assist_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null check (action in ('summarize', 'followup', 'nextstep')),
  lead_id uuid references leads(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_assist_log_user_id_created_at_idx on ai_assist_log(user_id, created_at);

alter table ai_assist_log enable row level security;

-- Reps see their own usage; managers/admins can review the whole team's —
-- added now even though no UI reads it yet, so a later usage-review screen
-- doesn't need another migration.
create policy "ai_assist_log_select_own_or_manager" on ai_assist_log for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('ADMIN', 'SALES_MANAGER')
  ));
