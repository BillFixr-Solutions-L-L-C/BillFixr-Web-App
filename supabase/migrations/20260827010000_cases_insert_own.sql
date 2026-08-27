-- Customers can create their own case (tied to a bill they own),
-- matching the same trust level already granted for bills/support_tickets.
-- Status *updates* deliberately stay off-limits to direct client writes
-- (see cases_admin_write) — a customer being able to freely set their
-- own case straight to 'paid' or 'response_received' would bypass real
-- payment/negotiation entirely. Status transitions go through
-- /api/dev/advance-case instead, which validates ownership and only
-- allows a fixed allowlist of "safe to self-advance" statuses via the
-- service role.
create policy "cases_insert_own" on public.cases
  for insert with check (user_id = auth.uid());
