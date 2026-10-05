-- Re-scan is allowed once per case. Each one is a fresh AI read of the
-- document that the customer doesn't pay extra for, so it's a one-off
-- correction for a result that looks wrong, not something to repeat.
--
-- Written only by the re-scan path via the service role (customers have no
-- UPDATE on cases under RLS), so no policy change is needed.
alter table public.cases add column rescanned_at timestamptz;

comment on column public.cases.rescanned_at is
  'Set the first time the customer re-scans this case; a second re-scan is refused.';
