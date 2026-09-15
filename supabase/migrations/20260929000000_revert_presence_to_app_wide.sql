-- Reverted per user feedback: scoping "online" to only when an admin
-- has a specific Live Chat conversation open (20260928000000) isn't how
-- the industry actually does this -- tools like Intercom/Zendesk/Drift
-- use a broader "agent is active in the console" presence signal, not
-- one scoped to a single conversation (that's closer to what a typing
-- indicator or read receipt is for, a different feature). Back to
-- AdminPresenceHeartbeat mounted app-wide in AdminShell.
--
-- Freshness window set to 3 minutes rather than the original 5 -- still
-- a "somewhere in the app" signal, not per-conversation, but a shorter
-- buffer keeps it more honest about an admin who's actually gone.
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
      and p.last_seen_at > now() - interval '3 minutes'
  );
$$;
