-- Phase K patch: MEETING task type, used by the Schedule Meeting feature.
-- Run ALONE in the Supabase SQL Editor (adding an enum value must be its own
-- transaction). The frontend degrades gracefully to a TODO task until this
-- is applied.

alter type task_type add value if not exists 'MEETING';
