-- Step 31b: the Figma upload flow has a "Personal Information" +
-- "Hospital Information" step. The AI extraction already returns the
-- provider as {name, phone, email, address} (AiParty) but only the name
-- was ever persisted — these columns give the other three a home so the
-- step can be AI-filled and then corrected by the customer.
--
-- They live on bills (not cases) because the provider is a property of the
-- document the AI read it from, and a bill has its info before a case
-- exists. Written by the AI pipeline and by the customer's own save route
-- (service role), so no policy change is needed.
alter table public.bills
  add column provider_email text,
  add column provider_phone text,
  add column provider_address text;

-- "NextGen Number" in the Personal Information section — the customer's
-- identifier with the provider's practice-management system. Free text:
-- no format is specified anywhere and it varies by provider.
alter table public.profiles add column nextgen_number text;

-- profiles_update_own_or_admin (20260904000000) pins self-updates by
-- listing the columns a customer may NOT change — role, role_id, status,
-- profile_completion_exempt, email. nextgen_number is not one of those, so
-- it is self-editable with no policy change.
comment on column public.profiles.nextgen_number is
  'Customer-supplied provider/practice identifier shown in the dashboard Personal Information step.';
