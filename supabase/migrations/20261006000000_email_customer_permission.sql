-- Emailing a customer from a support ticket sends mail from BillFixr's own
-- domain to a real person, so it gets its own permission rather than
-- riding on client_data: full (which also covers reading tickets, replying
-- in live chat and moderating testimonials). Same shape as
-- can_delete_accounts / can_delete_bills / can_issue_refunds.
--
-- Granted to the two roles that actually work tickets; every other role
-- keeps its existing ticket access but can no longer send email.
alter table public.roles add column can_email_customers boolean not null default false;

update public.roles set can_email_customers = true where name in ('Super Admin', 'Support Admin');

create function public.can_email_customers()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select r.can_email_customers
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Keeps the audit trail complete for mail sent to customers.
alter table public.admin_activity_log drop constraint admin_activity_log_action_check;
alter table public.admin_activity_log add constraint admin_activity_log_action_check check (
  action in (
    'login', 'invited_admin', 'resent_invite', 'promoted_to_admin', 'deleted_account',
    'suspended_account', 'reactivated_account', 'deleted_bill', 'issued_refund',
    'uploaded_case_document', 'deleted_case_document', 'emailed_customer'
  )
);
