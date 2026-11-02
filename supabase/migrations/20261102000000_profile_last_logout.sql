-- Supabase Auth maintains auth.users.last_sign_in_at for us, which is
-- what the admin User Management table shows as "Last Login". There is
-- no equivalent for signing out — Auth does not record it — so if we
-- want it, we have to keep it ourselves.
--
-- Deliberately NOT given a customer-writable RLS policy. profiles has
-- had several holes closed where a signed-in customer could update
-- columns that were never meant to be theirs (see 20260904 and
-- 20260831030000). This column is written only by the server through the
-- service role, from a route that reads the caller's own session, so no
-- new UPDATE surface is opened on profiles at all.
--
-- It records the logouts we are told about. A session that ends because
-- the browser was closed, the token expired, or the device went away
-- never reaches the server and leaves this untouched — so a null, or an
-- older timestamp than last_sign_in_at, means "no logout was recorded",
-- never "still signed in". Anything displaying it has to say so.

alter table public.profiles
  add column if not exists last_logout_at timestamptz;

comment on column public.profiles.last_logout_at is
  'When this account last signed out, as reported by the app. Null when no sign-out has ever been recorded. Not proof of session state: sign-outs that never reach the server (closed browser, expired token) are not recorded. Written only by the service role.';
