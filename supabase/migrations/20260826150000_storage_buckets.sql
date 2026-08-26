-- Storage buckets for Step 2 (bills) and 2d (CVs).
insert into storage.buckets (id, name, public)
values
  ('bills', 'bills', false),
  ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- bills: objects are stored at "{user_id}/{filename}" — owners can
-- manage their own files, admins can read everything.
create policy "bills_storage_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'bills'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "bills_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'bills'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "bills_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'bills'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- cvs: applicants don't have accounts, so anyone can upload; only admins
-- (reviewing applications) can read them back.
create policy "cvs_storage_insert_public" on storage.objects
  for insert with check (bucket_id = 'cvs');

create policy "cvs_storage_select_admin" on storage.objects
  for select using (bucket_id = 'cvs' and public.is_admin());
