-- Security audit finding (BACKEND-PLAN.md "Security plan", Medium):
-- chat_messages_insert_own_or_admin only checked that the ticket belongs
-- to the caller — it never constrained the "from" column, so a customer
-- could insert a message on their own ticket with from='agent' or
-- from='ai' and arbitrary text, fabricating a fake support/AI reply in
-- their own chat history.
--
-- The live-chat feature (dashboard/support/page.tsx) legitimately needs
-- an "agent" row inserted right after a "user" row — the canned
-- immediate-acknowledgment reply from Step 7's contract stub — but that
-- now happens through a new server route (POST /api/dashboard/chat/send)
-- using the service role for the agent-side insert, which bypasses RLS
-- entirely. So the client-side path (session-scoped, subject to this
-- policy) only ever needs to insert from='user' — tighten to exactly
-- that; admin callers (used nowhere today, but kept for parity with the
-- rest of this table's admin-can-do-anything shape) are unrestricted.
drop policy "chat_messages_insert_own_or_admin" on public.chat_messages;
create policy "chat_messages_insert_own_or_admin" on public.chat_messages
  for insert with check (
    public.is_admin()
    or (
      "from" = 'user'
      and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    )
  );
