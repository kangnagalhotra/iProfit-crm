# iProfit CRM

Production-ready CRM (lead & sales management) — React + Vite frontend backed entirely by **Supabase** (Postgres, Auth, Row Level Security, Edge Functions). There is no separate application server: the frontend talks to Supabase directly, and business rules live in the database (triggers, RLS policies) and Edge Functions.

## Architecture

- **Frontend**: React 18 + Vite (`frontend/`), deployed as a static site (Netlify/Render/etc.)
- **Database & Auth**: Supabase project — schema, RLS policies, triggers, and seed data all live in `supabase/`
- **Server-side logic**: Postgres triggers (stage guards, activity logging, Closed Won → Project handover, MQL qualification gate) plus Supabase Edge Functions (`supabase/functions/`) for privileged operations (company resolution, round-robin owner assignment, bulk CSV import, user creation)

## Quick start

### 1. Supabase

Create a Supabase project, then run these against it (SQL Editor, or `supabase db push` with the CLI), in order:

```
supabase/schema.sql          # tables, enums, indexes, storage buckets
supabase/rls.sql             # Row Level Security policies + merge_accounts()
supabase/triggers.sql        # business-rule triggers + pg_cron jobs
supabase/auth-trigger.sql    # profile auto-creation on signup
supabase/seed.sql            # default stages, pipeline, sample data
```

For an existing project that predates the latest changes, apply the incremental patches instead:

```
supabase/phase-e-workflow-enhancements-patch.sql
supabase/phase-f-deal-lockdown-and-workflow-patch.sql
```

Deploy the Edge Functions with the Supabase CLI:

```bash
supabase functions deploy resolve-company pick-owner bulk-import create-user
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # app on http://localhost:5173
```

Create your first users in the Supabase Dashboard (Authentication → Add user); `seed.sql` shows how to promote one to ADMIN.

## What's included

- Supabase Auth with role-based access (Admin / Sales Manager / Sales Rep) enforced by RLS
- Leads with configurable stages, MQL qualification gate (ICP + BANT), round-robin auto-assignment
- Contacts module with many-to-many Lead associations
- Companies with domain-based duplicate blocking and merge
- Deals created exclusively by converting a Qualified lead (enforced by a DB trigger), stage-mapped probabilities, Closed Won → automatic Project handover
- Single Product catalog (Private/Government sector attribute) wired into deal line items
- Tasks, Activities timeline, Support Tickets, Customer Success board, Notifications, CSV import/export
