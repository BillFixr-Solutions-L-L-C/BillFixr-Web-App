-- Refunds + chargebacks/disputes. Refunds are admin-initiated (gated the
-- same way bill deletion/account deletion already are — a dedicated
-- boolean + security-definer function, not a plain is_admin() check);
-- disputes are always Stripe/bank-initiated, so there's no equivalent
-- "who can create one" gate — only the webhook writes them, via the
-- service-role client.

-- refunded_amount tracks cumulative refunds against a payment (dollars,
-- matching `amount`'s existing convention) — written only by the
-- charge.refunded webhook handler (source of truth), never the admin
-- route that triggers the refund, same "webhook confirms, nothing else
-- does" discipline as payment confirmation itself. A separate
-- refund-status column was deliberately not added — "refunded" /
-- "partially refunded" is computed by comparing refunded_amount to
-- amount at read time, so there's nothing to keep in sync.
alter table public.payment_records add column refunded_amount numeric(10, 2) not null default 0;

-- can_issue_refunds mirrors can_delete_accounts/can_delete_bills exactly.
-- Granted to Finance Admin too (not just Super Admin) — that role
-- already exists specifically for "manages payments and billing" per
-- its own seeded description and finance:full domain grant.
alter table public.roles add column can_issue_refunds boolean not null default false;

update public.roles set can_issue_refunds = true where name in ('Super Admin', 'Finance Admin');

create function public.can_issue_refunds()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select r.can_issue_refunds
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
    ),
    false
  );
$$;

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
    'deleted_bill',
    'issued_refund'
  ));

-- One row per Stripe dispute (a charge can only ever have one dispute at
-- a time in practice), kept as its own table rather than columns on
-- payment_records so the full lifecycle (needs_response -> under_review
-- -> won/lost, or a warning-* variant) is preserved as history, not
-- overwritten in place.
create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references public.payment_records (id),
  stripe_dispute_id text not null unique,
  amount numeric(10, 2) not null,
  reason text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_disputes_payment_record_id_idx on public.payment_disputes (payment_record_id);

alter table public.payment_disputes enable row level security;

-- Admin-readable only (same audience as payment_records itself); only
-- ever written by the webhook route via the service-role client, which
-- bypasses RLS entirely — no insert/update/delete policy needed, same
-- shape as stripe_events.
create policy "payment_disputes_select_admin" on public.payment_disputes
  for select using (public.is_admin());
