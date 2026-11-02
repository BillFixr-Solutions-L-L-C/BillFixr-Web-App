# Work Progress

## 2026-08-19 15:24 WAT - Production Upgrade Started

Goal: move the Milestone 1 ingestion/OCR/extraction service toward a production-grade architecture.

Planned checkpoints:

1. Durable processing state: SQLite-backed jobs/documents/audit events.
2. Production contracts: job status APIs, validation reports, extraction metadata.
3. Storage hardening: encrypted-at-rest option, safer file validation, retention controls.
4. Async pipeline: request returns job IDs; worker processes extraction stages.
5. Reliability: retries, failure states, structured logs, test coverage.
6. Evaluation: repeatable public-sample benchmark with quality gates.

Current status: inspecting current app and preparing the first production primitives.

## 2026-08-19 15:29 WAT - Checkpoint 1 Contracts Added

Added production-facing configuration and API contract types:

- `ProcessingStatus`
- `ProcessingJob`
- `JobSubmissionResponse`
- `JobStatusResponse`
- `ValidationReport`
- `AuditEvent`
- upload limits and allowed file extensions
- local SQLite DB path
- optional storage encryption key

Next: implement durable SQLite repository and audit logging.

## 2026-08-19 15:36 WAT - Checkpoint 2 Persistence, Validation, Storage Hardening

Implemented:

- SQLite repository for jobs, processed document payloads, and audit events.
- Extraction validation reports with `quality_score` and `needs_review`.
- Upload size and extension validation.
- Safer filename normalization.
- Optional Fernet encryption for local file storage.

Next: central processing service and async job endpoints.

## 2026-08-19 15:43 WAT - Checkpoint 3 Jobs, Audit, Validation Integrated

Implemented and tested:

- `POST /v1/ingestion/documents/process-async`
- `GET /v1/jobs/{job_id}`
- `POST /v1/jobs/{job_id}/run`
- `GET /v1/audit/events`
- sync processing now uses the same validation service as async processing
- encrypted local storage test
- repository persistence test

Verification: `20 passed`.

Next: add worker loop/retry operations and production runbooks.

## 2026-08-19 15:51 WAT - Checkpoint 4 Worker, Runbook, Audit Hygiene

Implemented:

- `GET /v1/jobs` for job listing.
- Worker loop in `scripts/run_worker.py`.
- Dockerfile and `docker-compose.yml` with API and worker services.
- Production runbook.
- Public sample evaluator now emits pass/fail counts.
- Basic PHI redaction for audit event messages/metadata.

Next: final verification, sample evaluation, and production-readiness summary.

## 2026-08-19 15:47 WAT - Final Checkpoint

Final verification completed:

- Ruff lint: passed.
- Unit/integration tests: `22 passed`.
- Public sample evaluation: `10/10` passed minimum extraction gate.
- Live async API verification:
  - submitted `samples/sample_scanned_hospital_bill.pdf`
  - job transitioned `queued -> succeeded`
  - extraction method: `pdf_ocr`
  - validation score: `1.0`
  - persisted job result available from `GET /v1/jobs/{job_id}`

Current production-readiness rating: approximately 8/10 inside this local repo.

Remaining items that require external infrastructure or product decisions:

- Hosted HIPAA-compliant environment.
- BAA-covered AI/OCR/email/storage vendors.
- Authentication/RBAC.
- Managed database/object storage.
- Malware scanning service.
- Secrets manager.
- Centralized logs/metrics/traces with PHI redaction.
- Human review queue UX.
- Larger gold-labeled medical-bill evaluation set.

## 2026-08-19 16:10 WAT - Checkpoint 5 Local Production Substitutes

Temporary local replacements for managed production blockers are being implemented:

- Local API key auth and header-driven role checks.
- Local encrypted file storage using Fernet.
- Local malware scan gate with heuristic signatures and optional ClamAV.
- Local JSON logs and SQLite audit history.
- Local review queue UI for failed or low-confidence jobs.
- Environment templates and git ignores for secrets and generated PHI-like artifacts.

Next: finish UI wiring, add regression tests, document the local setup, then rerun lint/tests/sample evaluation.

## 2026-08-19 16:32 WAT - Checkpoint 6 Local Substitutes Verified

Implemented:

- Main demo UI can send local auth headers when `LOCAL_API_KEY` is enabled.
- New `/review` UI lists failed and `needs_review` jobs and can approve reviewed jobs.
- `/v1/review/queue` and `/v1/review/jobs/{job_id}/approve` are documented.
- Encrypted stored documents can now be extracted through `/v1/extraction/bills`.
- Stored document responses include malware scan metadata.
- README and runbook now separate local demo substitutes from hosted HIPAA production controls.

Verification:

- Ruff lint: passed.
- Unit/integration tests: `28 passed`.
- Public sample evaluation: `10/10` passed minimum extraction gate.

Current state: Milestone 1 is locally demoable with temporary auth, encrypted storage, scan gating, audit logs, async jobs, review queue, OCR/text extraction, and structured bill output.

## 2026-08-19 17:45 WAT - Checkpoint 7 Unsupported Document UX

Implemented:

- Unknown/non-medical-billing documents now return a graceful unsupported-document validation state instead of looking like an incomplete bill.
- Frontend result panel now shows document status, validation score, review-needed status, text extraction method, validation findings, and a clear unsupported document banner.
- Added regression coverage for resume-like uploads.

Next: rerun lint/tests and verify with the resume PDF through the live pipeline.

Verification update:

- Ruff lint: passed.
- Unit/integration tests: `29 passed`.
- Public sample evaluation: `10/10` passed minimum extraction gate.
- Live resume upload through API now returns `document_type=unknown`, `needs_review=true`, `quality_score=0.65`, and a clear unsupported-document message.
- Browser UI check confirmed the unsupported-document banner, validation score, review-needed state, and text extraction method render correctly.

## 2026-08-19 19:20 WAT - Checkpoint 8 OCR Field Tightening

Implemented:

- Added OCR text normalization for noisy scanned hospital bills.
- Improved patient name extraction from `PATIENT NAME` labels and next-line OCR patterns.
- Improved compact OCR date parsing for `STATEMENT DATE` and damaged `DUE DATE` tokens.
- Improved amount-due extraction from remittance/payment slip digit runs.
- Account number and patient responsibility are now review-critical missing fields.

Live verification on the uploaded UVM image:

- document type: `hospital_bill`
- provider: `UVM MEDICAL CENTER,`
- patient: `MCCURDY KATHRYN A`
- statement date: `2016-01-24`
- due date: `2016-02-18`
- patient responsibility: `28.03`
- account number: missing
- review needed: `true`

Verification: Ruff passed; tests `31 passed`.

## 2026-08-19 19:23 WAT - Checkpoint 9 OpenRouter AI Fallback

Implemented:

- Added `OPENROUTER_API_KEY` and `OPENROUTER_EXTRACTION_MODEL` settings.
- Added OpenRouter structured-output extraction via the OpenAI-compatible chat completions endpoint.
- Pipeline now runs deterministic extraction first, validates it, and calls AI only when validation needs review or classification is unknown.
- Frontend now sends `use_ai=true` by default and shows configured AI provider/model in the status bar.
- Added regression coverage for validation-triggered AI fallback using a fake provider.

Verification:

- Ruff lint: passed.
- Tests: `32 passed`.
- Public sample evaluation: `10/10` passed minimum extraction gate.

Setup: put the OpenRouter key in `.env` as `OPENROUTER_API_KEY=...`, restart the API, then upload a bill normally.

## 2026-08-20 22:00 WAT - Checkpoint 10 Case-Level AI Contracts

Implemented:

- Added root `AGENTS.md` defining the AI engineering build contract, product boundaries, milestone expectations, and evaluation standard.
- Added case-level AI contracts for analysis, audit issues, recommended next action, and communication drafts.
- Added `app/casework.py` with initial case assembly, audit heuristics, recommendation logic, and draft generation.
- Added AI-owned endpoints:
  - `POST /v1/cases/process`
  - `GET /v1/cases/{case_id}/analysis`
  - `POST /v1/cases/{case_id}/drafts`
- Added repository support for loading processed documents at the case level.
- Added regression coverage for case analysis and draft generation.

Verification:

- Ruff lint: passed.
- Tests: `36 passed`.

Current state:

- The repo no longer stops at document extraction. It now returns a usable case-level AI output surface for downstream full-stack and automation work.

## 2026-08-20 23:58 WAT - Checkpoint 11 Demo Frontend Redesign

Implemented:

- Rebuilt the main demo UI around the case-level AI flow instead of a single extraction screen.
- The frontend now presents Milestone 1 through later milestone surfaces as one connected product story:
  - case intake
  - OCR and extraction
  - audit and recommendation preview
  - draft generation
  - automation readiness
- Added a clearer operator-facing layout for upload/pasted text intake, runtime status, case outcome summary, document evidence, AI draft output, and raw JSON.
- Kept the unsupported-document state visible so wrong uploads still demo gracefully.

Next:

- Run live browser smoke checks against the redesigned page.
- Verify the primary case-processing flow against the local API.

## 2026-08-21 00:08 WAT - Checkpoint 12 Patient-Facing Milestone 1 Preview

Implemented:

- Added a separate patient-facing demo page at `/demo/patient`.
- The operator console now links to the patient preview and stores the latest processed case in local browser storage.
- The patient preview converts AI output into product language:
  - what we found
  - what is missing
  - what happens next
  - the prepared draft
- Added a fallback sample rendering so the page still demonstrates Milestone 1 even before a fresh upload is run.

Next:

- Verify the new route serves correctly.
- Confirm the latest processed case renders in the patient view.

## 2026-08-21 01:18 WAT - Checkpoint 13 Milestone 2 Audit and Savings Engine

Implemented:

- Expanded case analysis contracts with:
  - `financial_summary`
  - `savings_opportunities`
- Added case-level audit detections for:
  - insurance-versus-provider balance gaps
  - duplicate balances across hospital bills
  - missing adjustments
  - high patient balances
  - low-confidence extraction carry-through
- Added supportable savings estimation for:
  - bill versus EOB reconciliation gaps
  - duplicate-balance scenarios
  - self-pay assistance opportunities without a forced unsupported number
- Updated draft generation so negotiation drafts can reference the current savings signal.
- Updated the operator demo and patient-facing demo to show Milestone 2 financial summary and savings output.

Verification:

- `PYTHONPATH=. pytest tests/test_casework.py tests/test_api.py -q` passed with `15 passed`.

Next:

- Restart the live demo server so the new Milestone 2 UI is visible.
- Run one live case through the updated analysis response.
