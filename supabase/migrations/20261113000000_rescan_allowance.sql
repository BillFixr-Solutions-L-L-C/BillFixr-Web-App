-- A second re-scan, and a count rather than a flag to track it.
--
-- `rescanned_at` is a timestamp, so it can only answer "has this case been
-- re-scanned at all". Asked for a second allowance, that is the wrong
-- shape: it would mean a second nullable timestamp column, and a third
-- for the one after that.
--
-- So: a counter, with the allowance expressed once in code (MAX_RESCANS
-- in src/lib/rescan.ts) rather than implied by which columns exist.
--
-- `rescanned_at` is kept, not dropped. It is the only record of WHEN a
-- re-scan happened, the admin case view reads it, and a count alone
-- cannot be audited against anything. Backfilled so an existing case that
-- has used its one re-scan still shows as having used one.
alter table public.cases
  add column rescan_count integer not null default 0
    check (rescan_count >= 0);

update public.cases
   set rescan_count = 1
 where rescanned_at is not null;

comment on column public.cases.rescan_count is
  'How many AI re-scans this case has used. The allowance lives in src/lib/rescan.ts (MAX_RESCANS), not here, so changing it does not need a migration. `rescanned_at` still records when the most recent one happened.';
