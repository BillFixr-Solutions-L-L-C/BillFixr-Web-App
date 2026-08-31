-- Nothing in the app currently writes to notifications at all (only
-- deleteAccountCascade cleans them up), so the admin notification bell
-- would have had zero real rows to ever render or be tested against. This
-- is a deliberately minimal, single-event seed — new support ticket fans
-- out one notification per current admin — not a general notifications
-- system. Other admin-relevant events (new job application, new
-- testimonial, etc.) aren't wired yet; add similar triggers for those
-- later if wanted, same pattern as handle_new_user().
create function public.notify_admins_new_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, message)
  select id, 'support_ticket', 'New support ticket: ' || new.subject
  from public.profiles
  where role = 'admin';
  return new;
end;
$$;

create trigger on_support_ticket_created
  after insert on public.support_tickets
  for each row
  execute function public.notify_admins_new_support_ticket();
