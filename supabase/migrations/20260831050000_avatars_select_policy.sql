-- Missed this in the previous migration: a public bucket's `public: true`
-- flag only exempts the dedicated public-download endpoint
-- (/storage/v1/object/public/...) from RLS — the regular authenticated
-- Storage API (which `{ upsert: true }` uses to check whether the object
-- already exists before deciding insert vs. update) still needs a real
-- select policy. Without this, upload({ upsert: true }) failed with
-- "new row violates row-level security policy" even on a brand-new path,
-- caught while testing the avatar upload feature end-to-end.
create policy "avatars_storage_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
