from __future__ import annotations

from app.contracts import (
    DocumentType,
    MedicalBillExtraction,
    ValidationFinding,
    ValidationReport,
    ValidationSeverity,
)


def validate_extraction(extraction: MedicalBillExtraction) -> ValidationReport:
    findings: list[ValidationFinding] = []

    if extraction.document_type == DocumentType.unknown:
        findings.append(
            _finding(
                "document_type",
                (
                    "This file was readable, but it does not look like a supported medical billing document. "
                    "Upload a hospital bill, explanation of benefits, collection letter, or financial assistance form."
                ),
                "error",
            )
        )

    if extraction.document_type == DocumentType.hospital_bill:
        _require(findings, extraction.provider.name, "provider.name", "Provider name is missing.")
        _require(findings, extraction.account_number, "account_number", "Account number is missing.")
        _require(
            findings,
            extraction.patient_responsibility.amount,
            "patient_responsibility.amount",
            "Patient responsibility is missing.",
        )

    if extraction.total_charges.amount is not None and extraction.total_charges.amount < 0:
        findings.append(_finding("total_charges.amount", "Total charges cannot be negative.", "error"))

    if (
        extraction.patient_responsibility.amount is not None
        and extraction.total_charges.amount is not None
        and extraction.patient_responsibility.amount > extraction.total_charges.amount
    ):
        findings.append(
            _finding(
                "patient_responsibility.amount",
                "Patient responsibility is greater than total charges.",
                "warning",
            )
        )

    if extraction.due_date and extraction.statement_date and extraction.due_date < extraction.statement_date:
        findings.append(_finding("due_date", "Due date is before statement date.", "warning"))

    error_count = sum(1 for finding in findings if finding.severity == ValidationSeverity.error)
    warning_count = sum(1 for finding in findings if finding.severity == ValidationSeverity.warning)
    critical_missing = any(
        finding.field in {"account_number", "patient_responsibility.amount"}
        for finding in findings
    )
    score = max(0.0, 1.0 - (error_count * 0.35) - (warning_count * 0.15))

    return ValidationReport(
        quality_score=round(score, 2),
        needs_review=error_count > 0 or score < 0.75 or critical_missing,
        findings=findings,
    )


def _require(
    findings: list[ValidationFinding],
    value: object,
    field: str,
    message: str,
) -> None:
    if value is None or value == "":
        findings.append(_finding(field, message, "warning"))


def _finding(field: str, message: str, severity: str) -> ValidationFinding:
    return ValidationFinding(
        field=field,
        message=message,
        severity=ValidationSeverity(severity),
    )
