-- profiles_insert_own let any authenticated user set their own `role`
-- (the policy only checked id = auth.uid(), not the role value) — a client
-- could POST role: 'admin' directly. Replace client-side inserts with a
-- server-side trigger that always creates new profiles as 'customer'.
-- Admin accounts are created separately (Step 4c), not via public signup.

drop policy "profiles_insert_own" on public.profiles;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'customer',
    'active'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
