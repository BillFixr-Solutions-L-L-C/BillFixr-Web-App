-- Bug found in live verification right after 20260927000000 shipped: the
-- with_check subqueries used bare `id` instead of qualifying it as
-- `support_tickets.id` (the discipline every other self-update policy in
-- this project follows, e.g. profiles' `p.id = profiles.id`). Postgres
-- resolved the unqualified `id` to the subquery's own `t.id` instead of
-- the outer candidate row, making `where t.id = id` collapse to `where
-- t.id = t.id` -- always true -- so the subquery returned every one of a
-- customer's tickets instead of just the one being updated. That's
-- harmless with exactly one ticket (works by luck) but throws "more than
-- one row returned by a subquery" for any customer with two or more --
-- which the chat-history feature (Step 26) guarantees will be common.
-- This would have silently broken rating for most real users.
drop policy "support_tickets_update_own_rating" on public.support_tickets;
create policy "support_tickets_update_own_rating" on public.support_tickets
  for update using (user_id = auth.uid() and status = 'resolved')
  with check (
    user_id = auth.uid()
    and status = 'resolved'
    and subject = (select t.subject from public.support_tickets t where t.id = support_tickets.id)
    and message = (select t.message from public.support_tickets t where t.id = support_tickets.id)
    and chat_rating between 1 and 5
  );
