-- Phase H patch: rep-editable Expected Revenue on deals.
-- null = auto-calculated in the UI as Value x Probability; a stored value is
-- a manual override entered by the sales rep/manager (same null-means-derived
-- pattern as forecast_category and probability_override).
-- Run in the Supabase SQL Editor. Idempotent.

alter table opportunities
  add column if not exists expected_revenue numeric(15, 2)
    check (expected_revenue is null or expected_revenue >= 0);
