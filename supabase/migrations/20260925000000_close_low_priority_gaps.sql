-- Closes the remaining low-priority items flagged at the end of Step 24:
-- communication_logs/follow_ups had the same is_admin()-only write
-- pattern as everything closed there (both are part of the case
-- negotiation lifecycle -- communication_logs is a case's letter/email/
-- call history, follow_ups is its 3/7/21-day cadence -- so both map to
-- the negotiation domain, same as cases itself). Neither table has any
-- session-scoped write path in the app today (only the follow-ups cron
-- and account-deletion cascade touch them, both via the service role),
-- so tightening costs nothing.
--
-- The avatars bucket is deliberately left alone: it's `public: true` by
-- its own original design (see 20260831040000_profile_avatars.sql) --
-- anyone with the URL can already view any avatar via the public
-- download endpoint regardless of RLS, so gating the authenticated-API
-- select policy wouldn't add any real protection, only inconsistency.
drop policy "communication_logs_admin_write" on public.communication_logs;
create policy "communication_logs_insert_admin" on public.communication_logs
  for insert with check (public.get_domain_access('negotiation') = 'full');
create policy "communication_logs_update_admin" on public.communication_logs
  for update using (public.is_admin()) with check (public.get_domain_access('negotiation') = 'full');
create policy "communication_logs_delete_admin" on public.communication_logs
  for delete using (public.get_domain_access('negotiation') = 'full');

drop policy "follow_ups_admin_only" on public.follow_ups;
create policy "follow_ups_select_admin" on public.follow_ups
  for select using (public.is_admin());
create policy "follow_ups_insert_admin" on public.follow_ups
  for insert with check (public.get_domain_access('negotiation') = 'full');
create policy "follow_ups_update_admin" on public.follow_ups
  for update using (public.is_admin()) with check (public.get_domain_access('negotiation') = 'full');
create policy "follow_ups_delete_admin" on public.follow_ups
  for delete using (public.get_domain_access('negotiation') = 'full');

-- bills/cvs storage reads: an admin viewing a customer's uploaded bill or
-- a job applicant's CV should need the matching domain, same view-level
-- threshold ("has some access", not necessarily full) already required
-- to even reach the admin pages that request these files
-- (admin/uploads, admin/users/[id], admin/cases/[id] all gate on
-- client_data; admin/careers gates on hr).
drop policy "bills_storage_select_own_or_admin" on storage.objects;
create policy "bills_storage_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'bills'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or (public.is_admin() and public.get_domain_access('client_data') != 'none')
    )
  );

drop policy "cvs_storage_select_admin" on storage.objects;
create policy "cvs_storage_select_admin" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and public.is_admin()
    and public.get_domain_access('hr') != 'none'
  );
