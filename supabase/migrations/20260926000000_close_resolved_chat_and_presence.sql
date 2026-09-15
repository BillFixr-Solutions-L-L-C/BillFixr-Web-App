-- Live chat had two real gaps reported directly by the user:
-- 1. Marking a ticket "resolved" didn't actually close the chat -- both
--    sides could keep typing into it forever, RLS included.
-- 2. No way for a customer to tell whether anyone's actually there to
--    answer, and no way to see past (resolved) conversations separately
--    from the live one.

-- A lightweight presence heartbeat -- updated by AdminShell every ~60s
-- while an admin has the panel open. Not locked by the Step 23 self-update
-- restrictions (those only cover role/role_id/status/profile_completion_exempt/email).
alter table public.profiles add column last_seen_at timestamptz;

-- security definer so a customer can get a plain yes/no without ever
-- being able to read other users' profiles directly (profiles RLS
-- correctly blocks that) -- only admins who could actually answer
-- (client_data: full) count.
create function public.support_is_online()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_domain_access rda on rda.role_id = p.role_id
    where p.role = 'admin'
      and rda.domain = 'client_data'
      and rda.access_level = 'full'
      and p.last_seen_at > now() - interval '5 minutes'
  );
$$;

-- Once a ticket is resolved, neither side can add new chat_messages to
-- it -- enforced here, not just in the UI, same as every other write
-- gate closed this project. Reopening (admin clicks "Mark in-progress")
-- already exists and un-closes it naturally, no separate "reopen" needed.
drop policy "chat_messages_insert_own_or_admin" on public.chat_messages;
create policy "chat_messages_insert_own_or_admin" on public.chat_messages
  for insert with check (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.status != 'resolved')
    and (
      (public.is_admin() and public.get_domain_access('client_data') = 'full')
      or (
        "from" = 'user'
        and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
      )
    )
  );
