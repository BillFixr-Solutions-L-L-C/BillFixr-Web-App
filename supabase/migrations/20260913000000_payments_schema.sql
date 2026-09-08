-- Step 7 (Payments). payment_records already exists from Step 0 — this
-- adds the two small pieces of support schema it needs to go live:
-- an admin-configurable success-fee percentage, and Stripe webhook
-- idempotency tracking.

-- Singleton settings row. id is pinned to 1 via the check constraint so
-- there is exactly one row, ever — simpler to query/type than a
-- key-value table for the one setting this app currently needs.
create table public.app_settings (
  id integer primary key default 1 check (id = 1),
  success_fee_percentage numeric(5, 2) not null default 30.00,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.app_settings (id) values (1);

alter table public.app_settings enable row level security;

-- Customers should be able to see the real rate they'll be charged, not
-- just admins.
create policy "app_settings_select_authenticated" on public.app_settings
  for select using (auth.role() = 'authenticated');
create policy "app_settings_update_admin" on public.app_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Stripe webhook idempotency: the same event can be delivered more than
-- once (Stripe's own documented retry behavior, and manual redelivery
-- from the Dashboard reuses the same event id). The webhook route tries
-- to insert the event id here first; a unique-violation means "already
-- processed," and it can safely no-op. No RLS policies at all — this is
-- service-role/webhook-route only, same shape as signup_pairings (the
-- row's own presence is the access control, not a policy).
create table public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
