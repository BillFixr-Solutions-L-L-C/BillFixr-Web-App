-- Step 30: the customer can now send their appeal letter to the provider
-- from the Analysis Complete page (Figma "Send Letter"). Nothing stored
-- where it went or when, and no provider contact existed anywhere in the
-- schema. Both columns are written only by the send-letter route via the
-- service role (customers still have no UPDATE path on cases under RLS),
-- so no policy change is needed.
alter table public.cases
  add column provider_email text,
  add column letter_sent_at timestamptz;
