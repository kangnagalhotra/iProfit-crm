-- Phase R: let a team configure their OWN external proposal form URL
-- (Typeform, Google Forms, JotForm, Microsoft Forms, etc.) instead of the
-- previously hardcoded Typeform form (Group 5 addendum). Safe as a single
-- transaction — no enum ADD VALUE here, just widening an existing CHECK
-- constraint.
--
-- Reuses the proposal_templates table (kind='TEXT'/'WIZARD' already exist)
-- with a third kind, 'EXTERNAL', whose `body` column stores the imported
-- form's URL. There's at most one EXTERNAL-kind row at a time — saving a
-- new URL updates that row rather than creating duplicates.

-- Find and drop whatever Postgres actually named the existing kind CHECK
-- constraint (rather than assuming the default naming convention, which
-- can't be verified from here — this credential has no DDL/catalog access).
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'proposal_templates'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%kind%';
  if cname is not null then
    execute format('alter table proposal_templates drop constraint %I', cname);
  end if;
end $$;

alter table proposal_templates add constraint proposal_templates_kind_check
  check (kind in ('TEXT', 'WIZARD', 'EXTERNAL'));

