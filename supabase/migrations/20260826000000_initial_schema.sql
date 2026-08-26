-- Initial schema for BillFixr, per BACKEND-PLAN.md's data model.
-- Auth is handled entirely by Supabase Auth (auth.users) — profiles extends
-- it with app-specific fields rather than storing credentials ourselves.

create extension if not exists pgcrypto;

-- ── profiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  admin_permission text check (admin_permission in ('super_admin', 'support_agent')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with app-specific fields. admin_permission is null for customers.';

-- security-definer helper so RLS policies can check "is this caller an
-- admin" without recursively querying profiles under RLS.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── bills ───────────────────────────────────────────────────────────────
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  filename text not null,
  storage_url text,
  status text not null default 'uploaded' check (status in ('uploaded', 'scanning', 'analyzed', 'error')),
  provider_name text,
  service_date date,
  statement_date date,
  uploaded_at timestamptz not null default now()
);

create index bills_user_id_idx on public.bills (user_id);

-- ── cases ───────────────────────────────────────────────────────────────
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id),
  user_id uuid not null references public.profiles (id),
  status text not null default 'uploaded' check (status in (
    'uploaded', 'scanning', 'analyzed',
    'closed_no_errors',
    'letter_sent', 'awaiting_response', 'response_received', 'resolved',
    'payment_pending', 'paid', 'closed'
  )),
  errors_detected integer,
  savings_found numeric(10, 2),
  appeal_letter_text text,
  ai_summary_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.cases.errors_detected is 'Phase 2 (AI) field — column exists now, populated once error detection lands.';
comment on column public.cases.savings_found is 'Phase 2 (AI) field.';
comment on column public.cases.appeal_letter_text is 'Phase 2 (AI) field.';
comment on column public.cases.ai_summary_text is 'Phase 2 (AI) field.';

create index cases_user_id_idx on public.cases (user_id);
create index cases_bill_id_idx on public.cases (bill_id);

-- ── communication_logs ─────────────────────────────────────────────────
create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id),
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null check (channel in ('letter', 'email', 'call')),
  content text,
  sent_at timestamptz not null default now()
);

create index communication_logs_case_id_idx on public.communication_logs (case_id);

-- ── payment_records ────────────────────────────────────────────────────
create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  case_id uuid references public.cases (id),
  type text not null check (type in ('commitment_fee', 'success_fee')),
  amount numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  processor_ref text,
  created_at timestamptz not null default now()
);

create index payment_records_user_id_idx on public.payment_records (user_id);
create index payment_records_case_id_idx on public.payment_records (case_id);

-- ── support_tickets ────────────────────────────────────────────────────
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index support_tickets_user_id_idx on public.support_tickets (user_id);

-- ── chat_messages ──────────────────────────────────────────────────────
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id),
  "from" text not null check ("from" in ('user', 'agent', 'ai')),
  text text not null,
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Phase 2 for AI-authored messages, but the table exists now for the live-chat/support flow.';

create index chat_messages_ticket_id_idx on public.chat_messages (ticket_id);

-- ── job_postings ───────────────────────────────────────────────────────
create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  listing_description text not null,
  responsibilities text[] not null default '{}',
  requirements text[] not null default '{}',
  benefit text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- ── job_applications ───────────────────────────────────────────────────
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_postings (id),
  full_name text not null,
  email text not null,
  phone text,
  cv_storage_url text,
  status text not null default 'received' check (status in ('received', 'reviewed')),
  created_at timestamptz not null default now()
);

create index job_applications_job_id_idx on public.job_applications (job_id);

-- ── testimonials ───────────────────────────────────────────────────────
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  rating smallint not null check (rating between 1 and 5),
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index testimonials_user_id_idx on public.testimonials (user_id);

-- ── newsletter_subscribers ─────────────────────────────────────────────
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz not null default now()
);

-- ── follow_ups ─────────────────────────────────────────────────────────
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id),
  cadence_day smallint not null check (cadence_day in (3, 7, 21)),
  scheduled_at timestamptz not null,
  sent boolean not null default false
);

create index follow_ups_case_id_idx on public.follow_ups (case_id);
create index follow_ups_due_idx on public.follow_ups (scheduled_at) where not sent;

-- ── notifications ──────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  type text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);

-- ── updated_at trigger for cases ──────────────────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cases_set_updated_at
  before update on public.cases
  for each row
  execute function public.set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.bills enable row level security;
alter table public.cases enable row level security;
alter table public.communication_logs enable row level security;
alter table public.payment_records enable row level security;
alter table public.support_tickets enable row level security;
alter table public.chat_messages enable row level security;
alter table public.job_postings enable row level security;
alter table public.job_applications enable row level security;
alter table public.testimonials enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.follow_ups enable row level security;
alter table public.notifications enable row level security;

-- profiles: users see/update their own row; admins see/update all
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- bills: owner + admin
create policy "bills_select_own_or_admin" on public.bills
  for select using (user_id = auth.uid() or public.is_admin());
create policy "bills_insert_own" on public.bills
  for insert with check (user_id = auth.uid());
create policy "bills_update_own_or_admin" on public.bills
  for update using (user_id = auth.uid() or public.is_admin());

-- cases: owner (read-only) + admin (full)
create policy "cases_select_own_or_admin" on public.cases
  for select using (user_id = auth.uid() or public.is_admin());
create policy "cases_admin_write" on public.cases
  for all using (public.is_admin()) with check (public.is_admin());

-- communication_logs: readable by the owning case's user + admin
create policy "communication_logs_select_own_or_admin" on public.communication_logs
  for select using (
    public.is_admin()
    or exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );
create policy "communication_logs_admin_write" on public.communication_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- payment_records: owner (read-only) + admin (full). Rows are created
-- server-side (payment webhook) using the service role, which bypasses RLS.
create policy "payment_records_select_own_or_admin" on public.payment_records
  for select using (user_id = auth.uid() or public.is_admin());
create policy "payment_records_admin_write" on public.payment_records
  for all using (public.is_admin()) with check (public.is_admin());

-- support_tickets: owner can read/create; only admin updates status
create policy "support_tickets_select_own_or_admin" on public.support_tickets
  for select using (user_id = auth.uid() or public.is_admin());
create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (user_id = auth.uid());
create policy "support_tickets_update_admin" on public.support_tickets
  for update using (public.is_admin());

-- chat_messages: readable/insertable by the ticket's owner + admin
create policy "chat_messages_select_own_or_admin" on public.chat_messages
  for select using (
    public.is_admin()
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );
create policy "chat_messages_insert_own_or_admin" on public.chat_messages
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

-- job_postings: public read of open postings, admin manages
create policy "job_postings_select_public" on public.job_postings
  for select using (status = 'open' or public.is_admin());
create policy "job_postings_admin_write" on public.job_postings
  for all using (public.is_admin()) with check (public.is_admin());

-- job_applications: anyone can apply (no BillFixr account required);
-- only admin can review submissions
create policy "job_applications_insert_public" on public.job_applications
  for insert with check (true);
create policy "job_applications_select_admin" on public.job_applications
  for select using (public.is_admin());
create policy "job_applications_update_admin" on public.job_applications
  for update using (public.is_admin());

-- testimonials: authenticated users submit their own; anyone can read
-- approved ones (landing page carousel); admin manages the queue
create policy "testimonials_select_approved_or_own_or_admin" on public.testimonials
  for select using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "testimonials_insert_own" on public.testimonials
  for insert with check (user_id = auth.uid());
create policy "testimonials_update_admin" on public.testimonials
  for update using (public.is_admin());

-- newsletter_subscribers: public can subscribe; only admin can list
create policy "newsletter_subscribers_insert_public" on public.newsletter_subscribers
  for insert with check (true);
create policy "newsletter_subscribers_select_admin" on public.newsletter_subscribers
  for select using (public.is_admin());

-- follow_ups: internal scheduling — service role / admin only
create policy "follow_ups_admin_only" on public.follow_ups
  for all using (public.is_admin()) with check (public.is_admin());

-- notifications: owner can read + mark read; created server-side
create policy "notifications_select_own_or_admin" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications_update_own_read_state" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin());
