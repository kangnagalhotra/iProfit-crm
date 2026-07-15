-- Phase I patch: @mentions in notes/activities.
-- When a note or activity body contains "@Full Name" of a teammate, they get
-- an in-app MENTION notification linking to the record it was written on.
-- Server-side trigger so it works from every surface that writes activities
-- and can insert notifications (clients have no INSERT policy on
-- notifications by design). Run in the Supabase SQL Editor. Idempotent.

create or replace function notify_mentions() returns trigger as $$
declare
  p record;
  target_url text;
begin
  -- Only human-authored content — field-update audit rows can't mention.
  if new.type = 'FIELD_UPDATE' then return new; end if;

  target_url := case
    when new.lead_id is not null then '/leads/' || new.lead_id
    when new.opportunity_id is not null then '/deals/' || new.opportunity_id
    when new.account_id is not null then '/companies/' || new.account_id
    when new.task_id is not null then '/tasks/' || new.task_id
    else '/'
  end;

  for p in select id, full_name from profiles where is_active and id <> new.creator_id
  loop
    if position(lower('@' || p.full_name) in lower(new.body)) > 0 then
      insert into notifications (user_id, type, message, link_url)
      values (
        p.id, 'MENTION',
        (select full_name from profiles where id = new.creator_id) || ' mentioned you: ' || left(new.body, 120),
        target_url
      );
    end if;
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists activities_notify_mentions on activities;
create trigger activities_notify_mentions
  after insert on activities
  for each row execute function notify_mentions();
