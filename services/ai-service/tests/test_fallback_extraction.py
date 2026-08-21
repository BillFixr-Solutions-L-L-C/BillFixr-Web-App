from uuid import uuid4

from app.config import Settings
from app.contracts import DocumentType, MedicalBillExtraction
from app.ingestion.pipeline import ExtractionPipeline, parse_bill_text_fallback


def test_fallback_parser_extracts_core_bill_fields() -> None:
    text = """
    North Valley Hospital
    Account Number: ABC12345
    Total Charges: $12,450.00
    Insurance Paid: $8,000.00
    Patient Responsibility: $4,450.00
    """

    result = parse_bill_text_fallback(text)

    assert result.document_type == "hospital_bill"
    assert result.provider.name == "North Valley Hospital"
    assert result.account_number == "ABC12345"
    assert result.total_charges.amount == 12450.00
    assert result.insurance_paid.amount == 8000.00
    assert result.patient_responsibility.amount == 4450.00


def test_fallback_parser_extracts_patient_and_dates() -> None:
    text = """
    North Valley Hospital
    Patient: Jordan Taylor
    Statement Date: 2026-08-01
    Date of Service: 2026-07-18
    Please pay the amount due by 2026-08-31.
    Account Number: ABC12345
    Amount Due: $300.00
    """

    result = parse_bill_text_fallback(text)

    assert result.patient.name == "Jordan Taylor"
    assert result.statement_date.isoformat() == "2026-08-01"
    assert result.date_of_service_start.isoformat() == "2026-07-18"
    assert result.due_date.isoformat() == "2026-08-31"


def test_fallback_parser_handles_ocr_page_markers_before_provider() -> None:
    result = parse_bill_text_fallback(
        """
        --- page 1 OCR ---
        North Valley Hospital
        Patient Statement
        Account Number: ABC12345
        Amount Due: $300.00
        """
    )

    assert result.provider.name == "North Valley Hospital"


def test_fallback_parser_handles_public_statement_labels() -> None:
    result = parse_bill_text_fallback(
        """
        Guarantor number: 5555555
        Statement date: June 26, 2024
        Thank you for choosing Children's Hospital Colorado
        Please submit payment of $82.30 by July 17, 2024
        Your current balance $82.30
        """
    )

    assert result.document_type == "hospital_bill"
    assert result.provider.name == "Children's Hospital Colorado"
    assert result.account_number == "5555555"
    assert result.statement_date.isoformat() == "2024-06-26"
    assert result.due_date.isoformat() == "2024-07-17"
    assert result.patient_responsibility.amount == 82.30


def test_fallback_parser_classifies_eob() -> None:
    result = parse_bill_text_fallback("Explanation of Benefits. This is not a bill.")

    assert result.document_type == "explanation_of_benefits"


def test_fallback_parser_handles_noisy_uvm_scanned_bill() -> None:
    result = parse_bill_text_fallback(
        """
        UVM MEDICAL CENTER,
        HOSPITAL PATIENT FINANCIAL SERVICES
        University of Vermont
        MEDICAL CENTER
        THIS BILL IS FOR HOSPITAL
        SERVICES RENDERED TO:
        PATIENT NAME: MCCURDY,KATHRYN A
        ACCOUNT #:
        STATEMENT DATE: 012416
        DUE DATEo21816
        PATIENT AMOUNT DUE
        2 900323134 oooooo2803 7
        """
    )

    assert result.document_type == "hospital_bill"
    assert result.provider.name == "UVM MEDICAL CENTER,"
    assert result.patient.name == "MCCURDY,KATHRYN A"
    assert result.statement_date.isoformat() == "2016-01-24"
    assert result.due_date.isoformat() == "2016-02-18"
    assert result.patient_responsibility.amount == 28.03


def test_fallback_parser_repairs_five_digit_ocr_due_date() -> None:
    result = parse_bill_text_fallback(
        """
        UVM MEDICAL CENTER
        THIS BILL IS FOR HOSPITAL SERVICES
        PATIENT NAME:
        MCCURDY KATHRYN A
        DUE DATEo2816
        TOTAL DUE
        0000002803
        """
    )

    assert result.due_date.isoformat() == "2016-02-18"


def test_fallback_parser_normalizes_common_ocr_label_damage() -> None:
    result = parse_bill_text_fallback(
        """
        Mercy General Hospital
        ‘ACCOUNT NUMBER: OCR44556
        ANOUNT DUE: $145.67
        """
    )

    assert result.document_type == "hospital_bill"
    assert result.account_number == "OCR44556"
    assert result.patient_responsibility.amount == 145.67


def test_pipeline_uses_ai_fallback_when_deterministic_extraction_needs_review() -> None:
    class FakeProvider:
        is_configured = True
        provider_name = "openrouter"
        model = "test/model"

        def extract_bill(self, text: str) -> MedicalBillExtraction:
            extraction = MedicalBillExtraction(document_type=DocumentType.hospital_bill)
            extraction.provider.name = "UVM MEDICAL CENTER"
            extraction.account_number = "AI12345"
            extraction.patient_responsibility.amount = 28.03
            return extraction

    pipeline = ExtractionPipeline(Settings(), FakeProvider())

    response = pipeline.extract_from_text(
        case_id=uuid4(),
        text="UVM MEDICAL CENTER\nTHIS BILL IS FOR HOSPITAL SERVICES\nACCOUNT #:",
        use_ai=True,
    )

    assert response.model_used == "test/model"
    assert response.extraction.account_number == "AI12345"
    assert "ai_provider=openrouter" in response.warnings
