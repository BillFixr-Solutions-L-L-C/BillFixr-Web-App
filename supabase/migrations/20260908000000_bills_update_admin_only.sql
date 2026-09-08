-- Security audit finding (BACKEND-PLAN.md "Security plan", Medium):
-- bills_update_own_or_admin let a signed-in customer UPDATE any column
-- on their own bills row (status, provider_name, service_date,
-- statement_date, analysis_result) with no with_check at all.
--
-- Unlike profiles (where customers legitimately self-edit name/address)
-- or the earlier cases_insert_own fix (where the client legitimately
-- inserts, just not with arbitrary values), nothing in this codebase
-- ever does a client-side .update() on bills at all — every bill-status
-- advance happens through cases (via dev/advance-case, the service
-- role, or an admin) or is Phase 2 AI/OCR territory. So there's no
-- legitimate self-update case to carve a with_check around; the correct
-- fix is admin-only writes, matching cases_admin_write's existing shape
-- exactly. Select stays unchanged (bills_select_own_or_admin) — this
-- only tightens update.
drop policy "bills_update_own_or_admin" on public.bills;
create policy "bills_update_admin_only" on public.bills
  for update using (public.is_admin()) with check (public.is_admin());
