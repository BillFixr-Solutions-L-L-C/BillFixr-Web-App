# Milestone 1 Implementation Notes

## Goal

Build the ingestion layer that turns patient medical-billing documents into structured data the negotiation engine can use.

## Pipeline

1. Receive document from upload, n8n webhook, or email attachment.
2. Store original file with case-level isolation and SHA-256 hash.
3. Extract text from digital PDFs.
4. Fall back to OCR for image files and scanned bills.
5. Classify document type.
6. Extract structured bill fields.
7. Return normalized JSON to the full-stack app.

## Production Decisions Still Needed

- Storage target: local disk for development, S3/GCS/Azure Blob for production.
- OCR backend: Tesseract for MVP, AWS Textract/Google Document AI/Azure Document Intelligence for higher accuracy.
- Email source: IMAP for MVP, Gmail/Outlook API for production-grade OAuth and auditability.
- PHI controls: encryption, audit logs, retention policy, access controls, and vendor BAAs.

## Acceptance Criteria

- A PDF or image attachment from an email can be stored against a case.
- Text can be extracted from text PDFs and supported image files.
- A bill-like document can be converted into the `MedicalBillExtraction` JSON shape.
- The frontend can call stable ingestion and extraction APIs.
- Pricing source registry identifies where the later pricing indexer will pull benchmark data.

## Delivered Endpoints

- `POST /v1/ingestion/documents/process`: upload and immediately extract one or more bills.
- `POST /v1/ingestion/email/message`: parse attachments from a raw `.eml` file.
- `POST /v1/ingestion/email/sync`: connect to an IMAP inbox and ingest supported attachments.
- `POST /v1/extraction/bills`: extract from raw text or a stored document.
- `GET /v1/pricing/sources`: list pricing datasets.
- `POST /v1/pricing/hospital-transparency/parse-txt`: parse CMS hospital transparency TXT metadata.

## Milestone Demo Script

1. Start the service with `uvicorn app.main:app --reload`.
2. Open `http://127.0.0.1:8000/docs`.
3. Use `POST /v1/ingestion/documents/process` with a sample `.txt`, `.pdf`, or image bill.
4. Confirm the response includes `case_id`, `document_id`, storage metadata, extraction JSON, confidence, missing fields, and warnings.
5. Use `GET /v1/pricing/sources` to show the configured pricing sources.

For OCR specifically, upload:

- `samples/sample_scanned_hospital_bill.png` to show `text_extraction_method=image_ocr`.
- `samples/sample_scanned_hospital_bill.pdf` to show `text_extraction_method=pdf_ocr`.
- `samples/public-documents/ucla-health-hospital-statement.pdf` to show `text_extraction_method=pdf_text`.
