-- When a case enters awaiting_response, schedule the 3/7/21-day
-- follow-up cadence automatically via trigger (rather than app code) so
-- every path that sets this status gets follow-ups, not just today's
-- one dev-simulated transition. Content is a fixed template — the
-- actual Route Handler that sends these lives outside the DB (Vercel
-- Cron -> Next.js Route Handler -> Resend), this only schedules them.
create function public.schedule_case_follow_ups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'awaiting_response' and (old.status is distinct from 'awaiting_response') then
    insert into public.follow_ups (case_id, cadence_day, scheduled_at)
    values
      (new.id, 3, now() + interval '3 days'),
      (new.id, 7, now() + interval '7 days'),
      (new.id, 21, now() + interval '21 days');
  end if;
  return new;
end;
$$;

create trigger on_case_awaiting_response
  after update on public.cases
  for each row
  execute function public.schedule_case_follow_ups();
