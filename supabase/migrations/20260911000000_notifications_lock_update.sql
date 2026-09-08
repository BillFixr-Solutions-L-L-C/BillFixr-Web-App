-- Security audit finding (BACKEND-PLAN.md "Security plan", Low):
-- notifications_update_own_read_state had no with_check, so a user could
-- rewrite type/message/user_id on their own row, not just flip `read`.
-- The only real client-side update (NotificationBell.tsx) ever sets
-- {read: true} — lock the policy to exactly that for non-admin callers.
drop policy "notifications_update_own_read_state" on public.notifications;
create policy "notifications_update_own_read_state" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and type = (select n.type from public.notifications n where n.id = id)
      and message = (select n.message from public.notifications n where n.id = id)
    )
  );
