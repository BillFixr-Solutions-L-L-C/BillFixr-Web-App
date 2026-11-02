from uuid import uuid4

from app.casework import analyze_case, draft_communication
from app.contracts import (
    DocumentType,
    IngestionSource,
    MedicalBillExtraction,
    ProcessedDocument,
    RecommendedActionType,
    StoredDocument,
    ValidationReport,
)


def test_case_analysis_recommends_corrected_statement_when_bill_and_eob_exist() -> None:
    bill = _processed_document(
        document_type=DocumentType.hospital_bill,
        provider_name="North Valley Hospital",
        account_number="ABC12345",
        patient_amount=300.0,
        total_charges=1200.0,
        quality_score=1.0,
        needs_review=False,
    )
    eob = _processed_document(
        document_type=DocumentType.explanation_of_benefits,
        provider_name="North Valley Hospital",
        patient_amount=120.0,
        quality_score=0.95,
        needs_review=False,
    )

    analysis = analyze_case(case_id=uuid4(), processed_documents=[bill, eob])

    assert analysis.recommended_action.action_type == RecommendedActionType.request_corrected_statement
    assert analysis.financial_summary.patient_responsibility.amount == 300.0
    assert analysis.savings_opportunities[0].estimated_savings.amount == 180.0


def test_case_analysis_flags_duplicate_balances_and_estimates_savings() -> None:
    bill_one = _processed_document(
        document_type=DocumentType.hospital_bill,
        provider_name="North Valley Hospital",
        account_number="ABC12345",
        patient_name="Jordan Taylor",
        patient_amount=450.0,
        quality_score=0.92,
        needs_review=False,
    )
    bill_two = _processed_document(
        document_type=DocumentType.hospital_bill,
        provider_name="North Valley Hospital",
        account_number="ABC12345",
        patient_name="Jordan Taylor",
        patient_amount=450.0,
        quality_score=0.93,
        needs_review=False,
    )

    analysis = analyze_case(case_id=uuid4(), processed_documents=[bill_one, bill_two])

    assert any(issue.category == "duplicate_balance_suspected" for issue in analysis.issues)
    assert analysis.savings_opportunities[0].estimated_savings.amount == 450.0


def test_case_analysis_recommends_financial_assistance_for_large_self_pay_balance() -> None:
    bill = _processed_document(
        document_type=DocumentType.hospital_bill,
        provider_name="North Valley Hospital",
        account_number="ABC12345",
        patient_amount=2400.0,
        insurance_paid=0.0,
        quality_score=0.9,
        needs_review=False,
    )

    analysis = analyze_case(case_id=uuid4(), processed_documents=[bill])

    assert analysis.recommended_action.action_type == RecommendedActionType.request_financial_assistance
    assert any(issue.category == "financial_assistance_opportunity" for issue in analysis.issues)


def test_draft_generation_respects_action_override() -> None:
    processed = _processed_document(
        document_type=DocumentType.hospital_bill,
        provider_name="North Valley Hospital",
        account_number="ABC12345",
        patient_amount=300.0,
        quality_score=1.0,
        needs_review=False,
    )
    analysis = analyze_case(case_id=uuid4(), processed_documents=[processed])

    draft = draft_communication(
        analysis=analysis,
        processed_documents=[processed],
        user_notes="Need a formal record.",
        action_type_override=RecommendedActionType.request_itemized_bill,
    )

    assert "itemized" in draft.subject.lower()
    assert "Need a formal record." in draft.body


def _processed_document(
    *,
    document_type: DocumentType,
    provider_name: str | None = None,
    patient_name: str | None = None,
    account_number: str | None = None,
    patient_amount: float | None = None,
    total_charges: float | None = None,
    insurance_paid: float | None = None,
    quality_score: float,
    needs_review: bool,
) -> ProcessedDocument:
    extraction = MedicalBillExtraction(document_type=document_type, account_number=account_number, confidence=0.9)
    extraction.provider.name = provider_name
    extraction.patient.name = patient_name
    extraction.patient_responsibility.amount = patient_amount
    extraction.total_charges.amount = total_charges
    extraction.insurance_paid.amount = insurance_paid
    return ProcessedDocument(
        document=StoredDocument(
            source=IngestionSource.upload,
            original_filename="test.txt",
            content_type="text/plain",
            storage_path="/tmp/test.txt",
            sha256="x" * 64,
            byte_size=42,
        ),
        extraction=extraction,
        validation=ValidationReport(quality_score=quality_score, needs_review=needs_review, findings=[]),
    )
