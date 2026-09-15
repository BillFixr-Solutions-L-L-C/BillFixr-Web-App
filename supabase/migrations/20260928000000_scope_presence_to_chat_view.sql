-- User feedback: "Support is online" should only be true while an admin
-- has actually opened a Live Chat conversation, not just because they
-- have the admin panel open somewhere (AdminPresenceHeartbeat used to be
-- mounted app-wide in AdminShell; now it only mounts inside the Live
-- Chat detail view on admin/support). The 5-minute freshness window made
-- sense for a coarse "admin panel open somewhere" signal, but is too
-- generous now that the heartbeat is this precisely scoped -- shortened
-- to 2 minutes (covers one missed 60s heartbeat tick with margin,
-- without leaving "online" showing long after an admin actually left).
create or replace function public.support_is_online()
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
      and p.last_seen_at > now() - interval '2 minutes'
  );
$$;
