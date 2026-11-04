from app.contracts import DocumentType, MedicalBillExtraction
from app.validation import validate_extraction


def _bill(**kwargs) -> MedicalBillExtraction:
    extraction = MedicalBillExtraction(document_type=DocumentType.hospital_bill)
    extraction.provider.name = "MERCY GENERAL HOSPITAL"
    extraction.account_number = "A1"
    extraction.patient_responsibility.amount = 145.67
    for key, value in kwargs.items():
        setattr(extraction, key, value)
    return extraction


def test_a_bill_with_no_charges_and_no_line_items_does_not_score_full_marks() -> None:
    """This is what used to score 1.0 and skip review entirely."""
    report = validate_extraction(_bill())

    fields = {finding.field for finding in report.findings}
    assert "total_charges.amount" in fields
    assert "line_items" in fields
    assert report.quality_score < 1.0
    assert report.needs_review is True


def test_an_eob_is_checked_for_charges_too() -> None:
    """An EOB used to be checked for nothing at all, so it always passed."""
    extraction = MedicalBillExtraction(document_type=DocumentType.explanation_of_benefits)

    report = validate_extraction(extraction)

    fields = {finding.field for finding in report.findings}
    assert "total_charges.amount" in fields
    assert "line_items" in fields
    assert report.needs_review is True


def test_a_complete_bill_still_passes() -> None:
    from app.contracts import BillLineItem

    extraction = _bill()
    extraction.total_charges.amount = 2000.0
    extraction.line_items = [BillLineItem(description="Emergency department visit")]

    report = validate_extraction(extraction)

    assert report.findings == []
    assert report.quality_score == 1.0
    assert report.needs_review is False


def test_a_collection_letter_is_not_held_to_charges() -> None:
    extraction = MedicalBillExtraction(document_type=DocumentType.collection_letter)

    report = validate_extraction(extraction)

    fields = {finding.field for finding in report.findings}
    assert "line_items" not in fields
    assert "total_charges.amount" not in fields
