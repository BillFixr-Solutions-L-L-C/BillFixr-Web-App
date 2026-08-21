# BillFixr AI Service

This repo contains the upfront infrastructure/API contract work and Milestone 1 foundation for the hospital bill negotiation product.

The AI-owned surface now also includes the first case-level Milestone 2 and 3 primitives: case analysis, recommended next actions, and initial communication drafts.

## Delivered Scope

### Upfront Deposit: Infrastructure & API Contracts

- FastAPI service scaffold.
- Typed request/response contracts for document ingestion and bill extraction.
- AI provider boundary for OpenAI structured extraction.
- Environment contract in `.env.example`.
- n8n webhook contract and starter workflow JSON.
- Documentation for frontend/backend integration.

### Milestone 1: Ingestion, OCR & Email Extraction

- Email attachment extraction service for IMAP inboxes.
- PDF/image text extraction path.
- OCR fallback hook for scanned bills.
- Medical bill structured-data schema.
- Deterministic fallback parser for early development and tests.
- Pricing data source registry for CMS hospital transparency and Medicare fee schedule sources.
- Local production substitutes for demos: API key auth/RBAC headers, encrypted local storage, malware scan gate, JSON logs, SQLite audit trail, and review queue.

### Expanded AI Pipeline: Case Analysis & Drafting

- Case-level analysis that converts processed documents into audit issues and a recommended next action.
- Initial communication draft generation for billing, collections, hardship, and review workflows.
- AI engineering operating contract in `AGENTS.md`.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

Open API docs at:

```text
http://127.0.0.1:8000/docs
```

Open demo screens at:

```text
http://127.0.0.1:8000/
http://127.0.0.1:8000/review
```

If `LOCAL_API_KEY` is set in `.env`, enter the same key in the demo UI or pass it as `X-API-Key`.

Use these sample files with `POST /v1/ingestion/documents/process` for a quick Milestone 1 demo:

- `samples/sample_hospital_bill.txt`
- `samples/sample_scanned_hospital_bill.png`
- `samples/sample_scanned_hospital_bill.pdf`
- files in `samples/public-documents/`

## Production-Oriented Processing

Queue async jobs:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/ingestion/documents/process-async \
  -F files=@samples/sample_scanned_hospital_bill.pdf \
  -F use_ai=false
```

Run the worker:

```bash
.venv/bin/python scripts/run_worker.py --once
```

Check job status:

```bash
curl -s http://127.0.0.1:8000/v1/jobs/<job_id>
```

Review low-confidence or failed jobs:

```bash
curl -s http://127.0.0.1:8000/v1/review/queue
curl -s -X POST http://127.0.0.1:8000/v1/review/jobs/<job_id>/approve
```

See [docs/production-runbook.md](docs/production-runbook.md).

## Core API

- `GET /health`
- `POST /v1/ingestion/documents`
- `POST /v1/ingestion/documents/process`
- `POST /v1/cases/process`
- `POST /v1/ingestion/email/sync`
- `POST /v1/ingestion/email/message`
- `POST /v1/extraction/bills`
- `GET /v1/cases/{case_id}/analysis`
- `POST /v1/cases/{case_id}/drafts`
- `GET /v1/jobs`
- `POST /v1/jobs/{job_id}/run`
- `GET /v1/review/queue`
- `POST /v1/review/jobs/{job_id}/approve`
- `GET /v1/audit/events`
- `GET /v1/pricing/sources`
- `POST /v1/pricing/hospital-transparency/parse-txt`

See [docs/api-contracts.md](docs/api-contracts.md) for request/response shapes.
