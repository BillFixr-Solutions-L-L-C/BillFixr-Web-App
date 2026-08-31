-- Denormalized snapshot of the submitter's name at submission time, so the
-- public landing-page carousel (anon RLS, can't see profiles) can display a
-- name without joining a restricted table, and so the name survives even if
-- the submitter later deletes their account.
alter table public.testimonials add column name text not null;
