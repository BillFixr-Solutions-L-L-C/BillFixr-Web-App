-- Backs "User Activity & Login Logs" on admin/user-management/page.tsx,
-- previously an honest empty state ("Activity logging isn't enabled
-- yet") since no such table existed — see BACKEND-PLAN.md Step 6f.
--
-- Scope decision: admin-account activity only, not every login/action
-- site-wide (that would be a much bigger, unscoped feature, and this
-- panel sits specifically next to the admin-accounts table on this
-- page). Covers: admin logins, and the admin-account lifecycle actions
-- already reachable from this page or its neighbors (invite, resend
-- invite, revoke/delete, promote, suspend, reactivate).
--
-- actor_id/target_id are plain uuids with no foreign key — both refer to
-- profiles rows that may later be deleted (an admin who left, an account
-- that was removed), and this is a historical log, not a live relation.
-- actor_name/target_name are snapshotted at write time for the same
-- reason (matches the pattern already used for deletion-confirmation
-- emails elsewhere in this codebase).
create table public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text not null,
  action text not null check (action in (
    'login',
    'invited_admin',
    'resent_invite',
    'promoted_to_admin',
    'deleted_account',
    'suspended_account',
    'reactivated_account'
  )),
  target_id uuid,
  target_name text,
  created_at timestamptz not null default now()
);

create index admin_activity_log_created_at_idx on public.admin_activity_log (created_at desc);

alter table public.admin_activity_log enable row level security;

-- Admins can read the whole log (it's specifically an admin-facing
-- panel); only admins can ever write to it (server-side inserts always
-- run as an authenticated admin's session, or via the trigger below,
-- which only fires on a profiles.status change RLS already restricts to
-- admin callers). No update/delete policies — append-only.
create policy "admin_activity_log_select_admin" on public.admin_activity_log
  for select using (public.is_admin());
create policy "admin_activity_log_insert_admin" on public.admin_activity_log
  for insert with check (public.is_admin());

-- Suspend/reactivate happen via a couple of different direct-client
-- .update() call sites (AccountActions.tsx for customers,
-- UserManagementTable.tsx for admins) rather than one shared route — a
-- trigger on the actual column change logs both uniformly without
-- needing to touch either component. profiles_update_own_or_admin's RLS
-- already guarantees status can only change when the caller is an admin
-- (a non-admin's own status is locked to its existing value in that
-- policy's with check), so auth.uid() here is reliably the acting admin.
create function public.log_profile_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.admin_activity_log (actor_id, actor_name, action, target_id, target_name)
    values (
      auth.uid(),
      coalesce((select name from public.profiles where id = auth.uid()), 'System'),
      case when new.status = 'suspended' then 'suspended_account' else 'reactivated_account' end,
      new.id,
      new.name
    );
  end if;
  return new;
end;
$$;

create trigger profiles_log_status_change
  after update on public.profiles
  for each row
  execute function public.log_profile_status_change();
