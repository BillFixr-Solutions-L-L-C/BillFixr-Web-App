-- Security audit finding (BACKEND-PLAN.md "Security plan", Low):
-- job_applications_insert_public was `with check (true)` — an anonymous
-- applicant could set status='reviewed' directly at insert time instead
-- of it always starting at 'received'. Low consequence (just an
-- admin-facing triage flag) but same shape of gap as everything else in
-- this audit — pin it.
drop policy "job_applications_insert_public" on public.job_applications;
create policy "job_applications_insert_public" on public.job_applications
  for insert with check (status = 'received');
