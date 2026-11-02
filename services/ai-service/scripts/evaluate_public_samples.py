from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.ai.provider import ExtractionProvider
from app.config import Settings
from app.ingestion.pipeline import ExtractionPipeline

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_PATHS = [
    ROOT / "samples/public-documents",
    ROOT / "samples/sample_scanned_hospital_bill.png",
    ROOT / "samples/sample_scanned_hospital_bill.pdf",
    ROOT / "samples/sample_hospital_bill.txt",
]
OUTPUT_DIR = ROOT / "samples/eval-results"


def main() -> None:
    settings = Settings(
        storage_dir=ROOT / ".billfixr-data",
        cache_dir=ROOT / ".billfixr-cache",
        ocr_engine="tesseract",
    )
    provider = ExtractionProvider(settings)
    pipeline = ExtractionPipeline(settings, provider)

    files = collect_files()
    results = []
    for path in files:
        response = pipeline.extract_from_file(
            case_id=uuid4(),
            document_id=uuid4(),
            path=path,
            use_ai=False,
        )
        extraction = response.extraction
        results.append(
            {
                "file": str(path.relative_to(ROOT)),
                "document_type": extraction.document_type,
                "provider": extraction.provider.name,
                "patient": extraction.patient.name,
                "account_number": extraction.account_number,
                "statement_date": str(extraction.statement_date) if extraction.statement_date else None,
                "due_date": str(extraction.due_date) if extraction.due_date else None,
                "total_charges": extraction.total_charges.amount,
                "insurance_paid": extraction.insurance_paid.amount,
                "patient_responsibility": extraction.patient_responsibility.amount,
                "missing_fields": extraction.missing_fields,
                "warnings": response.warnings,
                "raw_text_chars": len(extraction.raw_text_excerpt or ""),
                "passed_minimum_extraction": _passed_minimum_extraction(response.warnings, extraction),
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "sample_count": len(results),
        "passed_count": sum(1 for result in results if result["passed_minimum_extraction"]),
        "failed_count": sum(1 for result in results if not result["passed_minimum_extraction"]),
        "results": results,
    }
    (OUTPUT_DIR / "public-sample-eval.json").write_text(json.dumps(payload, indent=2, default=str))
    (OUTPUT_DIR / "public-sample-eval.md").write_text(render_markdown(payload))
    print(json.dumps(payload, indent=2, default=str))


def collect_files() -> list[Path]:
    files: list[Path] = []
    for sample_path in SAMPLE_PATHS:
        if sample_path.is_dir():
            files.extend(
                path
                for path in sorted(sample_path.iterdir())
                if path.is_file() and path.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg", ".txt"}
            )
        elif sample_path.exists():
            files.append(sample_path)
    return files


def render_markdown(payload: dict) -> str:
    lines = [
        "# Public Sample Evaluation",
        "",
        f"Generated: `{payload['generated_at']}`",
        f"Samples tested: `{payload['sample_count']}`",
        f"Passed minimum extraction: `{payload['passed_count']}`",
        f"Failed minimum extraction: `{payload['failed_count']}`",
        "",
        "| File | Pass | Method | Type | Provider | Patient Responsibility | Missing Fields |",
        "| --- | --- | --- | --- | --- | ---: | --- |",
    ]
    for result in payload["results"]:
        method = next(
            (
                warning.split("=", 1)[1]
                for warning in result["warnings"]
                if warning.startswith("text_extraction_method=")
            ),
            "unknown",
        )
        missing = ", ".join(result["missing_fields"]) or "-"
        responsibility = result["patient_responsibility"]
        responsibility_text = "-" if responsibility is None else f"${responsibility:,.2f}"
        lines.append(
            "| {file} | {passed} | {method} | {doc_type} | {provider} | {responsibility} | {missing} |".format(
                file=result["file"],
                passed="yes" if result["passed_minimum_extraction"] else "no",
                method=method,
                doc_type=result["document_type"],
                provider=result["provider"] or "-",
                responsibility=responsibility_text,
                missing=missing,
            )
        )
    lines.append("")
    return "\n".join(lines)


def _passed_minimum_extraction(warnings: list[str], extraction) -> bool:
    has_text_method = any(warning.startswith("text_extraction_method=") for warning in warnings)
    has_identity = bool(extraction.provider.name or extraction.account_number)
    has_amount = bool(
        extraction.patient_responsibility.amount is not None
        or extraction.total_charges.amount is not None
        or extraction.insurance_paid.amount is not None
    )
    is_eob = str(extraction.document_type) == "explanation_of_benefits"
    return has_text_method and (is_eob or has_identity or has_amount)


if __name__ == "__main__":
    main()
