# Production Runbook

## Service Shape

The production-oriented service now has two deployable processes:

- API: accepts uploads, stores documents, creates jobs, exposes status and audit APIs.
- Worker: polls queued jobs and runs extraction/OCR/validation.

## Core Commands

Run locally:

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/bin/python scripts/run_worker.py --interval 3 --limit 10
```

Run with Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

## Production Controls Implemented

- Upload size limit.
- Allowed extension list.
- Durable SQLite job/document/audit state.
- Async processing jobs.
- Worker retry/failure states.
- Validation reports with quality scores.
- `needs_review` state for low-confidence documents.
- Optional Fernet encryption for local file storage.
- OCR/text extraction routing by file type.
- Repeatable public sample evaluation script.
- Optional local API key auth with header-driven roles.
- Local malware scanning gate with heuristic signatures and optional ClamAV.
- JSON application logs with PHI redaction.
- Review queue API and local reviewer UI at `/review`.

## Temporary Local Substitutes

These unblock a credible local Milestone 1 demo while the hosted healthcare infrastructure is still being selected:

| Production need | Local substitute in this repo |
| --- | --- |
| HIPAA hosting | Run only on localhost or a private dev VM; do not expose real PHI publicly. |
| Auth/RBAC | Set `LOCAL_API_KEY`; send `X-API-Key`, `X-User-ID`, and `X-User-Role`. |
| Managed encrypted object storage | Store uploads under `.billfixr-data/`; set `STORAGE_ENCRYPTION_KEY` for Fernet encryption. |
| Secrets manager | Keep secrets in local `.env`, which is ignored by git. |
| Malware scanning service | Keep `MALWARE_SCAN_ENABLED=true`; optionally install ClamAV and set `CLAMAV_ENABLED=true`. |
| Central observability | Write redacted JSON logs to `LOG_FILE` and audit events to SQLite. |
| Human review UI | Open `/review` to inspect failed or `needs_review` jobs and approve them. |
| BAAs/vendor compliance | Use synthetic or public sample files locally until vendors and BAAs are approved. |

## Production Controls Still External

These are required for a true 9/10 hosted healthcare production deployment:

- HIPAA-compliant hosting environment.
- BAA-covered vendors for AI/OCR/email/storage.
- Managed encrypted object storage.
- Secrets manager.
- Malware scanning service.
- Centralized logging/metrics/traces with PHI redaction.
- Production authentication and role-based access control.
- Database backups and retention automation.
- Formal incident response plan.

## Key APIs

- `POST /v1/ingestion/documents/process-async`
- `GET /v1/jobs/{job_id}`
- `GET /v1/jobs`
- `POST /v1/jobs/{job_id}/run`
- `GET /v1/audit/events`
- `GET /v1/review/queue`
- `POST /v1/review/jobs/{job_id}/approve`
- `POST /v1/ingestion/documents/process`

## Evaluation

```bash
.venv/bin/python scripts/evaluate_public_samples.py
```

Outputs:

- `samples/eval-results/public-sample-eval.json`
- `samples/eval-results/public-sample-eval.md`
