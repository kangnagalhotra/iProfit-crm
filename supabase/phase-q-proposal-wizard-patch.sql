-- Phase Q: Detailed Proposal Wizard (9-section form) — a second, richer
-- proposal template type living alongside the simple {{placeholder}}-text
-- "Standard Proposal" template from Group 5/F2. Safe as a single
-- transaction — no enum ADD VALUE here.
--
-- The wizard's actual section/field schema is NOT stored in the DB — it's
-- a hardcoded, typed TS constant (frontend/src/utils/proposalWizardSchema.ts)
-- for lower risk than a generic JSON-schema renderer. This patch just adds
-- a `kind` marker so a proposal_templates row can represent "there is a
-- wizard-based template available", and a `content` JSONB column on
-- deal_proposals to hold the wizard's full submitted data per version.

alter table proposal_templates add column kind text not null default 'TEXT'
  check (kind in ('TEXT', 'WIZARD'));

alter table deal_proposals add column content jsonb;

insert into proposal_templates (name, kind, body, is_default) values (
  'Standard Proposal (Detailed Form)', 'WIZARD',
  'Structured multi-section proposal — filled out via the in-app wizard, not this free-text body.',
  false
);
