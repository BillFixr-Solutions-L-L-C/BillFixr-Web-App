-- Step 31: the Completed Case screen lists documents the system had no
-- home for — New Bill, Acknowledgement Letter, Provider Responses and
-- Follow Up Letter. (Original Bill, Appeal Letter and Analysis are derived
-- from bills/cases and are NOT stored here.)
--
-- These arrive from the provider, so the team uploads them from the admin
-- case detail; files live in the existing `bills` bucket under
-- {user_id}/case-documents/{case_id}/... so its read policy (owner or an
-- admin with client_data access) already covers them and no new bucket or
-- storage policy is needed. user_id is denormalised so the customer-side
-- RLS check is a plain column test, matching every other table here.
create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (
    type in ('new_bill', 'acknowledgement_letter', 'provider_response', 'follow_up_letter')
  ),
  filename text not null,
  storage_url text not null,
  size_bytes integer,
  received_on date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index case_documents_case_id_idx on public.case_documents (case_id);

alter table public.case_documents enable row level security;

-- Customers read their own; any admin can read (same shape as bills).
create policy "case_documents_select_own_or_admin" on public.case_documents
  for select using (user_id = auth.uid() or public.is_admin());

-- Writes are staff-only and need full client_data, matching the gate on
-- every other customer-record write (migration 20260924000000).
create policy "case_documents_admin_write" on public.case_documents
  for all
  using (public.is_admin() and public.get_domain_access('client_data') = 'full')
  with check (public.is_admin() and public.get_domain_access('client_data') = 'full');

comment on table public.case_documents is
  'Provider-originated case documents uploaded by staff (new bill, acknowledgement, provider response, follow-up letter). Files live in the bills bucket under {user_id}/case-documents/{case_id}/.';

-- Keeps the admin audit trail complete for this new destructive action.
alter table public.admin_activity_log drop constraint admin_activity_log_action_check;
alter table public.admin_activity_log add constraint admin_activity_log_action_check check (
  action in (
    'login', 'invited_admin', 'resent_invite', 'promoted_to_admin', 'deleted_account',
    'suspended_account', 'reactivated_account', 'deleted_bill', 'issued_refund',
    'uploaded_case_document', 'deleted_case_document'
  )
);
