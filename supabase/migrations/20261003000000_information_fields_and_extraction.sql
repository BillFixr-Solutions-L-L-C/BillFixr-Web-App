-- Step 31c.
-- 1. Field renames requested after seeing the step in use: the duplicated
--    "Billing Manager Email" becomes a distinct Support Email, and
--    "NextGen Number" becomes "Client Hospital Number".
alter table public.profiles rename column nextgen_number to client_hospital_number;
alter table public.bills add column provider_support_email text;

comment on column public.profiles.client_hospital_number is
  'The customer''s identifier with their hospital, shown in the Personal Information step.';

-- 2. Cache for the AI reading of a bill.
-- The information step now asks the AI to read the identifying fields off
-- the document BEFORE the commitment fee is paid. The AI service returns
-- the whole picture in one call (extraction + audit findings + a drafted
-- letter), but only the identifying fields may be revealed at that point —
-- errors found, savings and the appeal letter stay behind the payment.
--
-- So the raw response is parked here rather than in bills.analysis_result:
-- RLS is on with NO policies at all, meaning it is reachable only through
-- the service role (same shape as stripe_events / signup_pairings). A
-- customer cannot select it even though it is about their own bill.
-- Keeping it also means the post-payment analysis reuses this reading
-- instead of paying for a second AI call.
create table public.bill_extractions (
  bill_id uuid primary key references public.bills (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bill_extractions enable row level security;

comment on table public.bill_extractions is
  'Service-role-only cache of the AI service response for a bill. No RLS policies by design: the customer-visible subset is copied onto bills, and the rest stays behind the commitment fee.';
