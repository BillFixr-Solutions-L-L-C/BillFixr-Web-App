-- Live chat was one-directional: the customer widget wrote real
-- chat_messages rows, but no admin surface ever read or replied to them,
-- and every customer message got an instant fake "agent" auto-reply
-- inserted via the service role (see CANNED_AGENT_REPLY). This migration
-- is the backend half of making it a real two-way conversation.

-- 1. Tighten the admin insert path. chat_messages_insert_own_or_admin's
-- admin branch was just is_admin() -- the same class of gap closed for
-- profiles in 20260922000000: any admin, regardless of role, could write
-- into any customer's chat thread. Admin replies now go through a
-- session-scoped insert gated on client_data: full (matching
-- support-tickets/[id]/route.ts's own PATCH check), same as everywhere
-- else in the Step 20/23 enforcement.
drop policy "chat_messages_insert_own_or_admin" on public.chat_messages;
create policy "chat_messages_insert_own_or_admin" on public.chat_messages
  for insert with check (
    (public.is_admin() and public.get_domain_access('client_data') = 'full')
    or (
      "from" = 'user'
      and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    )
  );

-- 2. Notify only admins who can actually respond. Mirrors
-- notify_admins_new_support_ticket()'s fan-out shape, but scoped to
-- roles with client_data: full rather than "every admin regardless of
-- role" -- a Careers/HR Admin has no business being paged for a live
-- chat message they have no access to act on.
create function public.notify_admins_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
begin
  if new."from" != 'user' then
    return new;
  end if;

  select p.name into customer_name
  from public.support_tickets t
  join public.profiles p on p.id = t.user_id
  where t.id = new.ticket_id;

  insert into public.notifications (user_id, type, message)
  select p.id, 'live_chat_message',
    'New live chat message from ' || coalesce(customer_name, 'a customer') || ': ' || left(new.text, 80)
  from public.profiles p
  join public.role_domain_access rda on rda.role_id = p.role_id
  where p.role = 'admin'
    and rda.domain = 'client_data'
    and rda.access_level = 'full';

  return new;
end;
$$;

create trigger on_chat_message_created
  after insert on public.chat_messages
  for each row
  execute function public.notify_admins_new_chat_message();
