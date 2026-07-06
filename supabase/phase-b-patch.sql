-- Phase B patch: profiles needs email for owner/assignee dropdowns (sublabel
-- text, etc.) throughout the frontend. auth.users isn't queryable via
-- PostgREST from the client, so we denormalize email onto profiles instead,
-- kept in sync by the signup trigger.

alter table profiles add column if not exists email varchar(255);

update profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

alter table profiles alter column email set not null;
create unique index if not exists profiles_email_idx on profiles(email);

create or replace function handle_new_auth_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::role, 'SALES_REP')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
