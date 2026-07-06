-- Auto-create a `profiles` row whenever a new Supabase Auth user is created.
-- Pass full_name/role via the signup call's user metadata, e.g.:
--   supabase.auth.admin.createUser({
--     email, password,
--     user_metadata: { full_name: 'Jane Doe', role: 'SALES_REP' },
--   })
-- Falls back to SALES_REP / email-as-name if metadata is omitted, matching
-- the old auth.service.ts default for everyone after the first (ADMIN) user
-- — the "first user becomes ADMIN" rule from that same file is a one-time
-- bootstrap concern, handled manually in setup (see seed.sql), not by this
-- trigger.

create function handle_new_auth_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::role, 'SALES_REP')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
