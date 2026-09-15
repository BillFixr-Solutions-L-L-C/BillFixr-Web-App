-- Lets a customer rate a live-chat conversation once an admin has
-- resolved it. support_tickets had no customer-side update policy at
-- all before this (only support_tickets_update_admin existed) -- this
-- adds one scoped narrowly: a customer can only ever set chat_rating,
-- only on their own already-resolved ticket, and can't touch
-- subject/status/message through this path (same column-locking
-- discipline as the profiles self-update policy).
alter table public.support_tickets add column chat_rating smallint check (chat_rating between 1 and 5);

create policy "support_tickets_update_own_rating" on public.support_tickets
  for update using (user_id = auth.uid() and status = 'resolved')
  with check (
    user_id = auth.uid()
    and status = 'resolved'
    and subject = (select t.subject from public.support_tickets t where t.id = id)
    and message = (select t.message from public.support_tickets t where t.id = id)
    and chat_rating between 1 and 5
  );
