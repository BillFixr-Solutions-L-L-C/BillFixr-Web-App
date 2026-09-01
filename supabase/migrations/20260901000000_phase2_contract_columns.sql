-- Step 7: stand up the real schema for Phase 2 (AI/OCR) content, always
-- null today, with the app falling back to the existing hardcoded mock
-- when null. Flexible jsonb rather than typed columns per field
-- (user decision 2026-09-01) — the exact output shape is the AI/ML
-- workstream's call, not something to lock in here.

alter table public.bills add column analysis_result jsonb;
comment on column public.bills.analysis_result is
  'Phase 2 (AI/OCR) field - full per-bill analysis payload (header info, amount breakdown, line items, errors found, estimated savings). Null until the OCR/error-detection workstream populates it.';

alter table public.cases add column admin_analysis jsonb;
comment on column public.cases.admin_analysis is
  'Phase 2 (AI) field - admin case-detail payload (OCR data extraction, risk assessment, negotiation timeline, reply drafts). Null until that workstream populates it.';
