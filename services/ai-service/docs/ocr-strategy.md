# OCR Strategy

Milestone 1 uses a staged ingestion and extraction strategy:

1. Try native text extraction for digital PDFs with `pdfplumber`.
2. Read plain text files directly.
3. For image bills, run the configured OCR backend.
4. Prefer PaddleOCR when installed and configured.
5. Fall back to Tesseract when PaddleOCR is unavailable.
6. For scanned PDFs, render pages to images with `pypdfium2`, then OCR those page images.
7. Send extracted text to the structured bill extraction pipeline.

## Supported Input Types

- PDFs with embedded text: `pdfplumber`
- Scanned PDFs: `pypdfium2` page rendering + OCR
- Images: OCR
- Plain text/Markdown
- CSV/TSV
- JSON/JSONL
- HTML/XML
- EML email files
- DOCX/XLSX when optional Office parsers are installed

## Current OCR Model

The default local demo OCR engine is Tesseract, configured with `OCR_ENGINE=tesseract`.

PaddleOCR remains available as the stronger optional open-source OCR worker with `OCR_ENGINE=paddleocr`, but it is heavier and may download/cache models on first use.

Install the stronger OCR stack with:

```bash
pip install -e ".[dev,ocr]"
```

## Production Recommendation

For production, keep OCR behind the same adapter boundary. Strong options:

- PaddleOCR / PP-OCR for self-hosted open-source OCR.
- AWS Textract
- Google Document AI
- Azure Document Intelligence

The application should keep the same output contract and record the extraction method in response warnings, so the frontend can show whether the bill was read from native PDF text, OCR, plain text, or unsupported input.
