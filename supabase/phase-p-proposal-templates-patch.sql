-- Phase P: Standard Proposal Template (Group 5 / F2). Safe as a single
-- transaction — no enum/type changes here.
--
-- Deliberately simple: `body` is a single text block with {{placeholder}}
-- tokens (deal_name/account_name/amount/owner_name), substituted client-side
-- and dropped into the existing "log proposal version" notes field — not a
-- full rich-text template engine. Ships with one default template; the
-- table is structured so more can be added later (a template picker/CRUD
-- UI is deferred until more than one template is actually needed).

create table proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table deal_proposals add column template_id uuid references proposal_templates(id) on delete set null;

insert into proposal_templates (name, body, is_default) values (
  'Standard Proposal',
$body$Proposal for {{account_name}}

Prepared for: {{account_name}}
Prepared by: {{owner_name}}
Deal: {{deal_name}}

1. Company Overview
[Brief overview of your company and why you're a good fit.]

2. Scope of Work
[List the deliverables / scope covered by this proposal.]

3. Pricing
Total value: {{amount}}
[Add a line-item breakdown if needed.]

4. Timeline
[Key milestones and target dates.]

5. Terms & Conditions
[Payment terms, validity period, and any other conditions.]

6. Signature
Accepted by: _______________________   Date: _______________
$body$,
  true
);

alter table proposal_templates enable row level security;

create policy "proposal_templates_select" on proposal_templates for select to authenticated using (true);

create policy "proposal_templates_write" on proposal_templates for all to authenticated
  using (is_manager_or_admin()) with check (is_manager_or_admin());
