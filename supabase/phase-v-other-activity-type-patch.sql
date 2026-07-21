-- Phase V: adds an 'OTHER' value to both task_type and activity_type so
-- "Other Activity" can be a real 4th quick-action type (Call/Meeting/Email/
-- Other), not folded into NOTE (which is a separate, always-visible
-- concept via NotesSection).
--
-- Run ALONE in the Supabase SQL Editor (adding an enum value must be its
-- own transaction, separate from anything that references the new value).
-- The frontend degrades gracefully — QuickTaskModal's "Other Activity"
-- button simply errors cleanly until this (and phase-w) are applied.

alter type task_type add value if not exists 'OTHER';
alter type activity_type add value if not exists 'OTHER';
