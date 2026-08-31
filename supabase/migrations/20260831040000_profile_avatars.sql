alter table public.profiles add column avatar_url text;

-- Public bucket (unlike bills/cvs) — avatars aren't sensitive, and a plain
-- public URL means the UI can just <img src> them without signed-URL
-- plumbing. Objects live at "{user_id}/{filename}", same ownership
-- convention as the bills/cvs buckets.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
