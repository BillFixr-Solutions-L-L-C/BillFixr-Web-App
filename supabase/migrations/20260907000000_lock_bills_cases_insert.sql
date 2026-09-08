-- Security audit finding (BACKEND-PLAN.md "Security plan", High):
-- bills_insert_own / cases_insert_own only checked user_id = auth.uid()
-- at insert time — nothing stopped a signed-in customer from directly
-- INSERTing a bills or cases row with status already set to 'analyzed'/
-- 'paid'/etc, or with a fabricated analysis_result/admin_analysis jsonb
-- blob, bypassing the upload -> scan -> negotiate flow entirely via a raw
-- REST call. dev/advance-case/route.ts's own comment already documented
-- the intended invariant ("cases.status is deliberately NOT
-- client-writable via RLS") but that only actually held for updates
-- (cases_admin_write is admin-only) — insert was wide open.
--
-- Real app behavior only ever inserts a bill with status='uploaded' and
-- every AI/OCR-owned column null (src/app/dashboard/page.tsx's upload
-- step), and a case with status='scanning' and every AI/admin-owned
-- column null (same file's handleCommitmentFeePaid) — so pin inserts to
-- exactly that shape. Anything past those initial values only ever gets
-- set later by the service-role-backed dev/advance-case route, the
-- Phase 2 contract columns' AI/OCR write path, or an admin, none of
-- which go through these insert policies (service role bypasses RLS
-- entirely; admin writes go through cases_admin_write, which is
-- untouched by this migration).
drop policy "bills_insert_own" on public.bills;
create policy "bills_insert_own" on public.bills
  for insert with check (
    user_id = auth.uid()
    and status = 'uploaded'
    and provider_name is null
    and service_date is null
    and statement_date is null
    and analysis_result is null
  );

drop policy "cases_insert_own" on public.cases;
create policy "cases_insert_own" on public.cases
  for insert with check (
    user_id = auth.uid()
    -- also close a smaller adjacent gap: without this, a case's bill_id
    -- could point at someone else's bill row while user_id = auth.uid(),
    -- since nothing previously checked that the referenced bill is
    -- actually the caller's own.
    and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = auth.uid())
    and status = 'scanning'
    and errors_detected is null
    and savings_found is null
    and appeal_letter_text is null
    and ai_summary_text is null
    and admin_analysis is null
    and manual_notes is null
    and override_reason is null
    and approval_chain is null
    and manual_review_status is null
    and manual_review_by is null
    and manual_review_at is null
  );
