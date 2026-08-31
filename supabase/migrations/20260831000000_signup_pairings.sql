-- Cross-device signup confirmation: lets the device that started signup
-- (showing "Check your email") automatically pick up a real session once
-- the confirmation link is clicked on a different device, without ever
-- transmitting a live session/credential between them. The row's own id
-- IS the bearer token for polling — service-role only, no RLS policies
-- (deny by default), every read/write goes through Route Handlers.
create table public.signup_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'consumed')),
  magic_token_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index signup_pairings_user_id_idx on public.signup_pairings (user_id);

alter table public.signup_pairings enable row level security;
-- Deliberately no policies — nothing here is ever readable/writable via
-- the anon or authenticated client roles, only the service role (which
-- bypasses RLS) from within Route Handlers.
