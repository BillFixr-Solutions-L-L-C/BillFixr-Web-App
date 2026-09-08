-- Follow-up to the RLS fix in 20260831030000_profile_completion.sql,
-- which locked role/role_id/status against self-update but explicitly
-- left profile_completion_exempt and email as known residual gaps. A
-- signed-in customer could otherwise flip their own exempt flag to skip
-- the mandatory-profile-completion gate entirely, or desync
-- profiles.email from the real auth.users.email (the two are meant to
-- stay in sync — there's no supported flow for changing profiles.email
-- directly, only Supabase Auth's own email-change confirmation flow).
-- Same fix shape: extend with_check so a non-admin self-update must
-- leave both columns exactly as they already are; admin-driven updates
-- (is_admin()) are untouched.
drop policy "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
      and role_id is not distinct from (select p.role_id from public.profiles p where p.id = auth.uid())
      and status = (select p.status from public.profiles p where p.id = auth.uid())
      and profile_completion_exempt = (select p.profile_completion_exempt from public.profiles p where p.id = auth.uid())
      and email = (select p.email from public.profiles p where p.id = auth.uid())
    )
  );
