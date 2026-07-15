-- Phase J patch: server-side task reminders.
-- Every 5 minutes, any open task whose reminder_at has passed raises a
-- TASK_DUE bell notification for its assignee, then clears reminder_at so it
-- fires exactly once (mirrors the old NestJS reminders service). The in-app
-- pop-up toast is client-side; this covers reminders that pass while the
-- app is closed. Run in the Supabase SQL Editor. Idempotent.

create or replace function send_task_reminders() returns void as $$
begin
  insert into notifications (user_id, type, message, link_url)
  select t.assignee_id, 'TASK_DUE',
    'Reminder: "' || t.title || '" is due ' || to_char(t.due_at, 'Mon DD, HH24:MI'),
    '/tasks/' || t.id
  from tasks t
  where t.reminder_at is not null
    and t.reminder_at <= now()
    and t.status not in ('COMPLETED', 'CANCELLED');

  update tasks set reminder_at = null
  where reminder_at is not null
    and reminder_at <= now()
    and status not in ('COMPLETED', 'CANCELLED');
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('send-task-reminders', '*/5 * * * *', 'select send_task_reminders();');
