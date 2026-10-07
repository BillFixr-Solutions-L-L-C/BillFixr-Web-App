-- Close the "create a case without paying" bypass.
--
-- cases_insert_own let a customer insert their own case directly. The
-- September lock-down (20260907000000) tightened *what* they could put in
-- the row — must own the referenced bill, status must be 'scanning', no
-- analysis/override fields — but creating the case at all was still free,
-- and a case is what the $5 commitment fee buys.
--
-- Nothing legitimate needs this policy. The only INSERT into public.cases
-- anywhere in the app is in the Stripe webhook
-- (api/webhooks/stripe/route.ts), which runs with the service role after a
-- commitment_fee payment_record reaches 'paid' — and the service role
-- bypasses RLS, so it is unaffected by dropping this. Admins keep
-- cases_insert_admin; customers keep cases_select_own_or_admin for reads.
--
-- Verified before writing this: a repo-wide search for an insert into
-- "cases" returns exactly one call site, the webhook's.

drop policy if exists "cases_insert_own" on public.cases;
