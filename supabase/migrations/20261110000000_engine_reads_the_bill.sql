-- The automation engine reads the bill now, so its reading needs somewhere
-- to live.
--
-- Why a second column instead of reusing `result`: the two readings are not
-- the same shape and not interchangeable. `result` holds the ai-service's
-- whole AiCaseProcessingResponse -- extraction, audit analysis and a drafted
-- letter together -- and /api/dev/process-with-ai reads the analysis and
-- draft out of it. The engine's /api/extract returns the extraction alone.
-- Writing one into the other's column would make the simulate button report
-- "AI service returned no extraction" on every bill the information step had
-- already read.
--
-- Nullable with no backfill: rows written before this migration have an
-- ai-service reading and no engine one, which is exactly what null says.
-- src/lib/engineBillData.ts reads engine_result first and falls back to
-- result, so an old bill keeps negotiating from the reading it has.
alter table public.bill_extractions add column engine_result jsonb;

-- `result` has to stop being NOT NULL, or the first write for a bill fails.
-- The information step now reads a bill through the engine and has no
-- ai-service response to put in `result`; the row it inserts carries
-- engine_result alone. Dropping the constraint is what makes a bill read
-- only by the engine representable at all.
--
-- Nothing reads `result` without checking: storedExtraction() returns null
-- for a missing one, and /api/dev/process-with-ai treats that as "not read
-- yet" and does its own call. Verified before changing this, not assumed.
alter table public.bill_extractions alter column result drop not null;

comment on column public.bill_extractions.engine_result is
  'The automation engine''s POST /api/extract reading of the bill (flat EngineExtraction shape: provider_name, patient_due, line_items[].cpt_code). Preferred over `result` when present -- it carries CPT and revenue codes that the audit rules need and the ai-service extraction does not. Null on bills read before 2026-11-10.';

comment on column public.bill_extractions.result is
  'The ai-service''s POST /v1/cases/process response (nested AiCaseProcessingResponse: extraction + analysis + draft). Still written by /api/dev/process-with-ai, which needs the analysis and draft. No longer the source for the information step -- see engine_result.';
