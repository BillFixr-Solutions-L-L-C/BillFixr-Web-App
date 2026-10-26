-- Stop throwaway/disposable addresses being used to register.
--
-- Enforced by a trigger on auth.users rather than in the app, because the
-- signup form calls supabase.auth.signUp() straight from the browser with
-- the anon key — there is no server route in between, so an app-level
-- check would be advice, not a gate. Anyone could call the auth endpoint
-- directly and skip it.
--
-- The list lives in a table rather than in code so a newly-noticed
-- provider can be blocked without a deploy.

create table if not exists public.blocked_email_domains (
  domain text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.blocked_email_domains enable row level security;

-- Readable by anyone: the signup form checks it to give an immediate,
-- clear message instead of a generic auth failure, and the contents are
-- not sensitive. Writes are admin-only.
drop policy if exists "blocked_email_domains_select_all" on public.blocked_email_domains;
create policy "blocked_email_domains_select_all" on public.blocked_email_domains
  for select using (true);

drop policy if exists "blocked_email_domains_admin_write" on public.blocked_email_domains;
create policy "blocked_email_domains_admin_write" on public.blocked_email_domains
  for all using (public.is_admin()) with check (public.is_admin());

-- SECURITY DEFINER so it can read the table regardless of who is
-- inserting, and pinned search_path so the lookup cannot be redirected.
create or replace function public.reject_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  email_domain text;
begin
  email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));

  if email_domain <> '' and exists (
    select 1 from public.blocked_email_domains where domain = email_domain
  ) then
    -- Matched by lib/authErrors.ts to show a human message.
    raise exception 'disposable_email_not_allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_disposable_email_before_insert on auth.users;
create trigger reject_disposable_email_before_insert
  before insert on auth.users
  for each row execute function public.reject_disposable_email();

-- The widely-used throwaway providers. Deliberately does NOT include
-- gmail/outlook/yahoo and friends: this product is sold to individuals
-- querying their own medical bills, and blocking ordinary consumer email
-- would turn away most real customers.
--
-- example.com is also deliberately absent — it is the reserved IANA
-- documentation domain used by this project's verification scripts.
insert into public.blocked_email_domains (domain, note) values
  ('mailinator.com', 'disposable'),
  ('guerrillamail.com', 'disposable'),
  ('guerrillamailblock.com', 'disposable'),
  ('sharklasers.com', 'disposable'),
  ('grr.la', 'disposable'),
  ('10minutemail.com', 'disposable'),
  ('10minutemail.net', 'disposable'),
  ('tempmail.com', 'disposable'),
  ('temp-mail.org', 'disposable'),
  ('temp-mail.io', 'disposable'),
  ('tempr.email', 'disposable'),
  ('tempinbox.com', 'disposable'),
  ('throwawaymail.com', 'disposable'),
  ('yopmail.com', 'disposable'),
  ('yopmail.net', 'disposable'),
  ('getnada.com', 'disposable'),
  ('dispostable.com', 'disposable'),
  ('maildrop.cc', 'disposable'),
  ('fakeinbox.com', 'disposable'),
  ('trashmail.com', 'disposable'),
  ('trashmail.de', 'disposable'),
  ('mailnesia.com', 'disposable'),
  ('mytemp.email', 'disposable'),
  ('emailondeck.com', 'disposable'),
  ('moakt.com', 'disposable'),
  ('discard.email', 'disposable'),
  ('mailcatch.com', 'disposable'),
  ('spamgourmet.com', 'disposable'),
  ('mintemail.com', 'disposable'),
  ('burnermail.io', 'disposable'),
  ('1secmail.com', 'disposable'),
  ('1secmail.net', 'disposable'),
  ('1secmail.org', 'disposable'),
  ('mohmal.com', 'disposable'),
  ('anonbox.net', 'disposable'),
  ('spambog.com', 'disposable'),
  ('einrot.com', 'fake-identity generator'),
  ('cuvox.de', 'fake-identity generator'),
  ('dayrep.com', 'fake-identity generator'),
  ('armyspy.com', 'fake-identity generator'),
  ('teleworm.us', 'fake-identity generator'),
  ('rhyta.com', 'fake-identity generator'),
  ('jourrapide.com', 'fake-identity generator'),
  ('superrito.com', 'fake-identity generator'),
  ('gustr.com', 'fake-identity generator'),
  ('fleckens.hu', 'fake-identity generator')
on conflict (domain) do nothing;
