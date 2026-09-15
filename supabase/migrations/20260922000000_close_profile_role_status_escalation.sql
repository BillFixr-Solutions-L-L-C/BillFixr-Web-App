-- Closes a privilege-escalation gap found while building Step 22's UI
-- polish: profiles_update_own_or_admin's WITH CHECK only ever tested
-- is_admin() for an admin caller, with zero regard to which role_id that
-- admin holds. Since is_admin() is true for every one of the 9 roles,
-- this meant ANY admin -- including e.g. a Contractor (system: none,
-- everything: none/assigned_only) -- could call
-- supabase.from('profiles').update({ role_id: <super-admin role id> })
-- directly from the client (own row or anyone else's) and grant
-- themselves or another account any role, completely bypassing every
-- route-level check Step 20 added. The same unrestricted is_admin()
-- branch also let any admin flip role ('customer' -> 'admin') and
-- suspend/reactivate any account, admin or customer, regardless of
-- their actual domain access.
--
-- Fix: role/role_id changes now always require system: full (matching
-- invite-admin/promote-to-admin/resend-invite's own route-level
-- enforcement). status changes require system: full when the target row
-- is an admin, or client_data: full when the target row is a customer --
-- Support Admin (system: none, client_data: full) legitimately suspends
-- customer accounts today via AccountActions and must keep working.
-- Every other column an admin might update on another row (name, etc.)
-- is left exactly as permissive as before -- this migration only closes
-- the role/role_id/status vector, per the reasoning in BACKEND-PLAN.md
-- Step 22. The non-admin self-update branch (a customer's own row) is
-- untouched.
drop policy "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (
    (
      public.is_admin()
      and (
        (
          role = (select p.role from public.profiles p where p.id = profiles.id)
          and role_id is not distinct from (select p.role_id from public.profiles p where p.id = profiles.id)
        )
        or public.get_domain_access('system') = 'full'
      )
      and (
        status = (select p.status from public.profiles p where p.id = profiles.id)
        or (
          case (select p.role from public.profiles p where p.id = profiles.id)
            when 'admin' then public.get_domain_access('system') = 'full'
            when 'customer' then public.get_domain_access('client_data') = 'full'
            else false
          end
        )
      )
    )
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
      and role_id is not distinct from (select p.role_id from public.profiles p where p.id = auth.uid())
      and status = (select p.status from public.profiles p where p.id = auth.uid())
      and profile_completion_exempt = (select p.profile_completion_exempt from public.profiles p where p.id = auth.uid())
      and email = (select p.email from public.profiles p where p.id = auth.uid())
    )
  );
