# API Contracts

The full-stack app and n8n should integrate with this service through stable HTTP contracts.

## Local Auth Headers

If `LOCAL_API_KEY` is empty, local auth is disabled. If it is set, protected endpoints require:

- `X-API-Key`: the configured local API key.
- `X-User-ID`: local user identifier for audit events.
- `X-User-Role`: `admin`, `patient`, `reviewer`, or `worker`.

## Health

`GET /health`

Returns service status and whether model access is configured.

## Upload Documents

`POST /v1/ingestion/documents`

Content type: `multipart/form-data`

Fields:

- `files`: one or more PDFs/images/text files.
- `case_id`: optional UUID. If omitted, the service creates one.
- `source`: `upload`, `email`, or `n8n`.

Response:

```json
{
  "case_id": "uuid",
  "documents": [
    {
      "document_id": "uuid",
      "source": "upload",
      "original_filename": "statement.pdf",
      "content_type": "application/pdf",
      "storage_path": ".billfixr-data/<case-id>/<hash>-statement.pdf",
      "sha256": "...",
      "byte_size": 12345,
      "created_at": "2026-08-13T00:00:00Z",
      "encrypted": false,
      "malware_scan_status": "clean"
    }
  ]
}
```

## Upload and Process Documents

`POST /v1/ingestion/documents/process`

Content type: `multipart/form-data`

Fields:

- `files`: one or more PDFs/images/text files.
- `case_id`: optional UUID. If omitted, the service creates one.
- `use_ai`: `true` or `false`.

This endpoint is the main Milestone 1 demo path: it stores each document, extracts text/OCR output, converts the bill into structured data, and returns both the document metadata and extraction result.

## Process Full AI Case

`POST /v1/cases/process`

Content type: `multipart/form-data`

Fields:

- `files`: one or more billing-related documents.
- `case_id`: optional UUID.
- `use_ai`: `true` or `false`.

This is the AI-owned end-to-end case endpoint. It:

- stores uploaded documents
- extracts structured document fields
- validates confidence and review state
- assembles a case-level analysis
- recommends the next action
- returns an initial draft for that action

## Queue Processing Job

`POST /v1/ingestion/documents/process-async`

Content type: `multipart/form-data`

Fields:

- `files`: one or more PDFs/images/text files.
- `case_id`: optional UUID.
- `use_ai`: `true` or `false`.

Returns a `job_id` immediately while processing runs in the background or worker process.

## Jobs

`GET /v1/jobs`

Optional query:

- `status`: `queued`, `running`, `succeeded`, `failed`, `needs_review`, or `approved`.
- `limit`: 1 to 500.

`GET /v1/jobs/{job_id}`

Returns the job state and any processed document payloads.

`POST /v1/jobs/{job_id}/run`

Runs or retries a job immediately.

## Review Queue

`GET /v1/review/queue`

Returns failed and `needs_review` jobs with processed document payloads.

`POST /v1/review/jobs/{job_id}/approve`

Marks a reviewed job as `approved` and records a reviewer audit event.

## Sync Email

`POST /v1/ingestion/email/sync`

```json
{
  "mailbox": "INBOX",
  "lookback_days": 7,
  "max_messages": 25,
  "dry_run": false
}
```

Required environment:

- `IMAP_HOST`
- `IMAP_USERNAME`
- `IMAP_PASSWORD`

## Parse Raw Email Message

`POST /v1/ingestion/email/message`

Content type: `multipart/form-data`

Fields:

- `file`: `.eml` message payload.
- `case_id`: optional UUID.
- `dry_run`: optional boolean.

This is useful for testing email attachment ingestion without connecting a real inbox.

## Extract Bill

`POST /v1/extraction/bills`

Use either raw `text` or a stored `document_id`.

```json
{
  "case_id": "uuid",
  "document_id": "uuid",
  "text": null,
  "use_ai": true
}
```

The response returns a normalized medical bill object containing provider, patient, account, claim, totals, line items, detected issues, missing fields, confidence, and model metadata.

## Case Analysis

`GET /v1/cases/{case_id}/analysis`

Returns:

- processed documents for the case
- case summary
- audit issues
- recommended next action
- confidence score
- human-review state

## Draft Generation

`POST /v1/cases/{case_id}/drafts`

```json
{
  "case_id": "uuid",
  "action_type": "request_itemized_bill",
  "user_notes": "Need coding detail."
}
```

`action_type` is optional. If omitted, the system drafts from the recommended next action in the case analysis.

## Pricing Sources

`GET /v1/pricing/sources`

Returns currently configured pricing-data sources for Milestone 1 discovery/indexing.

## Parse Hospital Price Transparency TXT

`POST /v1/pricing/hospital-transparency/parse-txt`

```json
{
  "text": "Hospital Name: Example Hospital\nMachine Readable File URL: https://example.test/standardcharges.json"
}
```

Returns the discovered hospital name, source page URL, machine-readable file URL, contact, and warnings.
