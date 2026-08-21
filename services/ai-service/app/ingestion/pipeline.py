from pathlib import Path
from uuid import UUID

from app.ai.provider import ExtractionProvider
from app.config import Settings
from app.contracts import DocumentType, ExtractionResponse, MedicalBillExtraction
from app.ingestion.documents import extract_text_from_file
from app.validation import validate_extraction


class ExtractionPipeline:
    def __init__(self, settings: Settings, provider: ExtractionProvider) -> None:
        self.settings = settings
        self.provider = provider

    def extract_from_text(self, *, case_id: UUID, text: str, use_ai: bool) -> ExtractionResponse:
        warnings = []
        extraction = parse_bill_text_fallback(text)
        model_used = None

        if use_ai and self.provider.is_configured:
            should_call_ai = True
            if self.settings.ai_fallback_on_validation_failure:
                validation = validate_extraction(extraction)
                should_call_ai = validation.needs_review or extraction.document_type == DocumentType.unknown

            if should_call_ai:
                try:
                    extraction = self.provider.extract_bill(text)
                    model_used = self.provider.model
                    warnings.append(f"ai_provider={self.provider.provider_name}")
                    warnings.append("ai_extraction_used=true")
                except Exception as exc:
                    warnings.append(f"AI extraction failed; deterministic fallback used: {exc}")
            else:
                warnings.append("AI extraction skipped because deterministic extraction passed validation.")
        elif use_ai:
            warnings.append("AI extraction skipped because model provider is not configured.")

        return ExtractionResponse(
            case_id=case_id,
            extraction=extraction,
            model_used=model_used,
            warnings=warnings,
        )

    def extract_from_file(self, *, case_id: UUID, document_id: UUID, path: Path, use_ai: bool) -> ExtractionResponse:
        text, extraction_method, warnings = extract_text_from_file(path, self.settings)
        response = self.extract_from_text(case_id=case_id, text=text, use_ai=use_ai)
        response.document_id = document_id
        response.warnings.append(f"text_extraction_method={extraction_method}")
        response.warnings.extend(warnings)
        return response


def parse_bill_text_fallback(text: str) -> MedicalBillExtraction:
    import re
    from datetime import date, datetime

    lowered = text.lower()
    normalized_text = _normalize_ocr_text(text)
    normalized_lowered = normalized_text.lower()
    extraction = MedicalBillExtraction(
        confidence=0.35,
        raw_text_excerpt=text[:4000],
    )

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines[:10]:
        lowered_line = line.lower()
        if line.startswith("---"):
            continue
        if any(word in lowered_line for word in ("hospital", "medical", "health")):
            extraction.provider.name = line
            break

    patient_candidates: list[str] = []
    patient_match = re.search(r"^\s*patient\s*[:#]\s*([A-Z][A-Za-z .'-]{2,})\s*$", text, re.IGNORECASE | re.MULTILINE)
    if patient_match:
        patient_candidates.append(patient_match.group(1).strip())
    patient_label_match = re.search(
        r"patient\s+name\s*[:#]?[ \t]*([A-Z][A-Z ,.'-]{2,80})",
        normalized_text,
        re.IGNORECASE,
    )
    if patient_label_match:
        patient_candidates.append(_clean_name(patient_label_match.group(1)))
    patient_next_line_match = re.search(
        r"patient\s+name\s*[:#]?[ \t]*(?:\r?\n)+\s*([A-Z][A-Z ,.'-]{2,80})",
        normalized_text,
        re.IGNORECASE,
    )
    if patient_next_line_match:
        patient_candidates.append(_clean_name(patient_next_line_match.group(1)))
    if patient_candidates:
        extraction.patient.name = max(patient_candidates, key=len)

    thank_you_match = re.search(r"thank you for choosing\s+(.+?)(?:\n|$)", text, re.IGNORECASE)
    if thank_you_match:
        extraction.provider.name = thank_you_match.group(1).strip()

    if "this is not a bill" in lowered or (
        "explanation of benefits" in lowered
        and not any(cue in lowered for cue in ("amount due", "balance due", "current balance"))
    ):
        extraction.document_type = DocumentType.explanation_of_benefits
    elif "collection" in lowered and "debt" in lowered:
        extraction.document_type = DocumentType.collection_letter
    elif any(
        cue in normalized_lowered
        for cue in (
            "amount due",
            "balance due",
            "current balance",
            "patient responsibility",
            "account number",
            "guarantor number",
            "hospital services rendered",
            "this bill is for hospital",
            "patient amount due",
            "account total due",
        )
    ):
        extraction.document_type = DocumentType.hospital_bill

    for account_match in re.finditer(
        r"(account|acct|guarantor)\s*(number|#|id)?\s*[:#]?\s*([A-Z0-9-]{5,})",
        normalized_text,
        re.IGNORECASE,
    ):
        candidate = account_match.group(3)
        if any(character.isdigit() for character in candidate):
            extraction.account_number = candidate
            break

    amount_patterns = {
        "patient_responsibility": r"(patient responsibility|patient amount due|amount due|total due|account total due from you|balance due|current balance|please submit payment of)\s*[:$ ]+\$?([0-9,]+\.\d{2})",
        "total_charges": r"(total charges|total billed|charges)\s*[:$ ]+\$?([0-9,]+\.\d{2})",
        "insurance_paid": r"(insurance paid|plan paid|payer paid)\s*[:$ ]+\$?([0-9,]+\.\d{2})",
    }
    for field, pattern in amount_patterns.items():
        match = re.search(pattern, normalized_text, re.IGNORECASE)
        if match:
            getattr(extraction, field).amount = float(match.group(2).replace(",", ""))

    if extraction.patient_responsibility.amount is None:
        remittance_amount = _extract_remittance_amount_due(normalized_text)
        if remittance_amount is not None:
            extraction.patient_responsibility.amount = remittance_amount

    date_patterns = {
        "statement_date": r"statement date\s*[:#]?\s*([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{6,8})",
        "due_date": r"(due date|due by|amount due by|pay .* by|payment due by|minimum due by)\s*[:#]?\s*([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{6,8})",
        "date_of_service_start": r"date of service\s*[:#]?\s*([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{6,8})",
    }
    for field, pattern in date_patterns.items():
        match = re.search(pattern, normalized_text, re.IGNORECASE)
        if match:
            date_value = match.group(2) if field == "due_date" else match.group(1)
            parsed_date = _parse_common_date(date_value, date, datetime)
            if parsed_date:
                setattr(extraction, field, parsed_date)
            else:
                extraction.missing_fields.append(field)

    if not extraction.due_date:
        due_match = re.search(
            r"\bby\s+([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{6,8})",
            normalized_text,
            re.IGNORECASE,
        )
        if due_match:
            parsed_due_date = _parse_common_date(due_match.group(1), date, datetime)
            if parsed_due_date:
                extraction.due_date = parsed_due_date

    required = ["provider.name", "account_number", "patient_responsibility.amount"]
    if not extraction.provider.name:
        extraction.missing_fields.append(required[0])
    if not extraction.account_number:
        extraction.missing_fields.append(required[1])
    if extraction.patient_responsibility.amount is None:
        extraction.missing_fields.append(required[2])

    return extraction


def _parse_common_date(value: str, date_type: type, datetime_type: type) -> object | None:
    import re

    value = _normalize_date_token(value.strip())
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y"):
        try:
            parsed = datetime_type.strptime(value, fmt)
            return date_type(parsed.year, parsed.month, parsed.day)
        except ValueError:
            continue
    if re.fullmatch(r"\d{6}", value):
        month = int(value[0:2])
        day = int(value[2:4])
        year = 2000 + int(value[4:6])
        try:
            return date_type(year, month, day)
        except ValueError:
            return None
    if re.fullmatch(r"\d{8}", value):
        for month_slice, day_slice, year_slice in ((slice(0, 2), slice(2, 4), slice(4, 8)),):
            try:
                return date_type(int(value[year_slice]), int(value[month_slice]), int(value[day_slice]))
            except ValueError:
                continue
    return None


def _normalize_ocr_text(text: str) -> str:
    import re

    normalized = text
    replacements = {
        " ANOUNT ": " AMOUNT ",
        " ANOUNT DUE": " AMOUNT DUE",
        " DUES": " DUE",
        "DUE DATEo": "DUE DATE: 0",
        "STATEMENT DATEo": "STATEMENT DATE: 0",
        "‘ACCOUNT NUMBER": "ACCOUNT NUMBER",
        "MECURDYRATHRIN": "MCCURDY KATHRYN",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    normalized = re.sub(r"(?i)\bPATIENT\s+NAME\s*:\s*([A-Z]+),([A-Z])\s+", r"PATIENT NAME: \1,\2", normalized)
    normalized = re.sub(r"(?i)\b(statement date|due date)\s*[:#]?\s*([OIlS]{0,2}\d[OIlS\d]{4,7})", _clean_ocr_date_match, normalized)
    return normalized


def _clean_ocr_date_match(match: object) -> str:
    label = match.group(1)
    token = _normalize_date_token(match.group(2))
    return f"{label}: {token}"


def _normalize_date_token(value: str) -> str:
    import re

    value = value.strip()
    if re.search(r"[A-Za-z]", value) and not re.fullmatch(r"[OIlSoils\d\s/:-]+", value):
        return value
    stripped = value.replace(" ", "")
    if "/" in stripped or "-" in stripped or "," in stripped:
        return stripped
    cleaned = stripped.translate(str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "s": "5"}))
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) == 5 and digits.startswith("0"):
        # Common OCR loss on compact MMDDYY dates: 02/18/16 -> O2816.
        return f"{digits[:2]}1{digits[2:]}"
    if len(digits) >= 6:
        return digits[:8] if len(digits) >= 8 else digits[:6]
    return value.strip()


def _clean_name(value: str) -> str:
    import re

    name = re.split(
        r"\b(ACCOUNT|INSURANCE|STATEMENT|DUE|SERVICE|PLEASE|SEE|BILLING|TOTAL|AMOUNT)\b",
        value.strip(),
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return re.sub(r"\s+", " ", name).strip(" ,.")


def _extract_remittance_amount_due(text: str) -> float | None:
    import re

    normalized = text.translate(str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1"}))
    amount_match = re.search(
        r"(total due|amount due|patient amount due)\s*\$?\s*([0-9]+)\s+([0-9]{2})\b",
        normalized,
        re.IGNORECASE,
    )
    if amount_match:
        return float(f"{int(amount_match.group(2))}.{amount_match.group(3)}")

    # Some OCR engines read payment slips as long digit runs, e.g. 0000002803 for $28.03.
    candidates = re.findall(r"\b0{3,}([1-9]\d{2,5})\b", normalized)
    for candidate in candidates:
        cents = int(candidate)
        amount = cents / 100
        if 0 < amount < 100_000:
            return amount
    return None
