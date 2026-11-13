-- The language BillFixr talks to a customer in.
--
-- Deliberately NOT "the language of the website". They are two different
-- things and conflating them is the whole point of this column:
--
--   * the display language is a preference, changed from the menu whenever
--     the customer likes, and lives in a cookie;
--   * the communication language is what we write TO them in -- emails,
--     notices, the AI's explanation of what a hospital said. It is fixed
--     at registration from the language they first chose, and the display
--     toggle must never move it.
--
-- A customer who switches the site to English to read a page keeps getting
-- their case correspondence in Spanish, which is the requirement.
--
-- 'en' | 'es'. A check constraint rather than a Postgres enum: adding a
-- third language to an enum needs ALTER TYPE and a migration ordering
-- dance, where this is a one-line change.
alter table public.profiles
  add column communication_language text not null default 'en'
    check (communication_language in ('en', 'es'));

comment on column public.profiles.communication_language is
  'The language BillFixr writes to this customer in: emails, case notices, and the AI''s explanation of a hospital reply. Set once at registration from the language chosen on first visit, and NOT changed by the website''s display-language switcher. Hospital-facing text is always English regardless of this value -- see src/lib/language.ts.';

-- The signup trigger carries it across from the sign-up metadata, the same
-- way it already carries the name. Anything other than 'es' is 'en': an
-- unrecognised value must not fail a registration, and English is the
-- language every one of our hospital-facing documents is already in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status, communication_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'customer',
    'active',
    case
      when lower(coalesce(new.raw_user_meta_data ->> 'communication_language', '')) = 'es' then 'es'
      else 'en'
    end
  );
  return new;
end;
$$;
