-- Phase M1: adds OTHER to lead_unqualified_reason (Group 3 / A2).
-- Run ALONE in the Supabase SQL Editor — adding an enum value must be its
-- own transaction, separate from anything that references the new value.

alter type lead_unqualified_reason add value if not exists 'OTHER';
