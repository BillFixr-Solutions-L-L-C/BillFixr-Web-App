-- Letter tracking for the Active Case screen (Figma 815:3326): whether the
-- provider opened the appeal letter, how many times, and when it was last
-- opened.
--
-- Resend reports delivery and opens through a webhook. The only way to tie
-- an event back to a case is the message id it returns when we send, which
-- send-letter was discarding — hence the new column.
--
-- Events are stored individually rather than as counters so the figures are
-- derived, never incremented: a webhook that is redelivered (which Resend
-- does) cannot inflate the count, because the unique event id is the
-- primary key.

alter table public.cases
  add column if not exists letter_message_id text;

create index if not exists cases_letter_message_id_idx
  on public.cases (letter_message_id)
  where letter_message_id is not null;

create table if not exists public.letter_events (
  -- Svix's message id for the webhook delivery. Redelivery of the same
  -- event is a no-op rather than a double count.
  id text primary key,
  case_id uuid not null references public.cases (id) on delete cascade,
  message_id text not null,
  type text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists letter_events_case_idx on public.letter_events (case_id, occurred_at desc);

alter table public.letter_events enable row level security;

-- The customer can see the tracking for their own case; staff with client
-- data access see everything. Only the service role writes, since the rows
-- come from Resend's webhook.
drop policy if exists "letter_events_select_own_or_admin" on public.letter_events;
create policy "letter_events_select_own_or_admin" on public.letter_events
  for select using (
    exists (
      select 1 from public.cases c
      where c.id = letter_events.case_id
        and (c.user_id = auth.uid() or public.is_admin())
    )
  );

comment on table public.letter_events is
  'Resend webhook events for a sent appeal letter. Open counts are derived by counting rows of type email.opened, so a redelivered webhook cannot inflate them.';
