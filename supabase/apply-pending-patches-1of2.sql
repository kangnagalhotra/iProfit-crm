-- ============================================================================
-- STEP 1 of 2 - run this alone first, then run apply-pending-patches-2of2.sql
--
-- Postgres cannot add an enum value and use it inside the same transaction
-- (error 55P04), and the Supabase SQL Editor wraps each run in one
-- transaction - so this single statement must be its own run.
-- ============================================================================

alter type deal_contact_role add value if not exists 'OTHER';