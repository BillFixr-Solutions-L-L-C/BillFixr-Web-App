-- Real columns behind the mandatory-profile-completion requirement.
-- Only Name + mailing address are required (user decision 2026-08-31) —
-- Username/DOB/Permanent Address from the old mock form are dropped
-- rather than added as real columns, since nothing in the product needs
-- them yet.
alter table public.profiles
  add column address text,
  add column city text,
  add column postal_code text,
  add column country text,
  add column profile_completion_exempt boolean not null default false;

-- Grandfather every account that already exists at the time this ships —
-- the requirement applies to new signups only (user decision 2026-08-31),
-- so the 2 real existing customers keep dashboard access as-is.
update public.profiles set profile_completion_exempt = true;

-- Pre-existing gap noticed while wiring the real Settings save endpoint:
-- profiles_update_own_or_admin's `using` clause let a signed-in customer
-- update *any* column on their own row via a direct client call (RLS has
-- no `with check`, so it defaults to the same as `using`) — including
-- role/role_id/status. handle_new_user() already fixed the equivalent
-- problem for insert (see its comment); update had the same hole open.
-- Tightened so a non-admin self-update must leave those three columns
-- exactly as they already are; admin-driven updates (via is_admin(), same
-- as before) are untouched either way. profile_completion_exempt and email
-- are narrower residual gaps (can bypass the completion gate / desync from
-- auth.users.email respectively) left for a follow-up pass — not part of
-- what this step was asked to build.
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
    )
  );
