-- Backs the "Manual Override & Administrative Controls" panel on
-- admin/cases/[id]/page.tsx, previously inert (no onClick handlers, no
-- backing columns) — see BACKEND-PLAN.md Step 6e. Deliberately a
-- separate track from cases.status (the real case lifecycle state
-- machine) rather than reusing/extending it: this is an admin's
-- annotation/decision about a case, not a replacement for where the
-- case actually sits in the uploaded -> ... -> closed pipeline, and
-- overloading status with approved/rejected/escalated values would
-- break the existing state-machine logic (caseStatus.ts, the case-status
-- email content map, etc).
alter table public.cases
  add column manual_notes text,
  add column override_reason text,
  add column approval_chain text,
  add column manual_review_status text check (manual_review_status in ('approved', 'rejected', 'escalated')),
  add column manual_review_by uuid references public.profiles (id),
  add column manual_review_at timestamptz;
