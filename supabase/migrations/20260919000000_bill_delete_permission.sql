-- Step 13: admin bill deletion, gated the same way account deletion
-- already is (roles.can_delete_accounts + can_delete_accounts(), from
-- 20260826140000_testimonials_domain_and_delete_gate.sql) rather than a
-- plain is_admin() check — deleting a customer's uploaded bill is just
-- as irreversible as deleting their account. Narrow default (Super Admin
-- only), same starting point as can_delete_accounts; can be granted to
-- other roles later with a one-line update.
alter table public.roles add column can_delete_bills boolean not null default false;

update public.roles set can_delete_bills = true where name = 'Super Admin';

create function public.can_delete_bills()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select r.can_delete_bills
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Give bill deletion the same audit trail as the other irreversible admin
-- actions already logged here (deleted_account, suspended_account, ...).
alter table public.admin_activity_log drop constraint admin_activity_log_action_check;

alter table public.admin_activity_log add constraint admin_activity_log_action_check
  check (action in (
    'login',
    'invited_admin',
    'resent_invite',
    'promoted_to_admin',
    'deleted_account',
    'suspended_account',
    'reactivated_account',
    'deleted_bill'
  ));
