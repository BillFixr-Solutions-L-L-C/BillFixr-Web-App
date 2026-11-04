"""The extraction contract has to accept what the model actually sends.

Regression tests for 2026-11-04: the model returned a complete claim
table for an EOB and `model_validate_json` rejected it with eight errors
-- dates written as they appear on the page, and explicit nulls for
confidence. The service then fell back to the regex pass and reported no
charges at all, so a correct read was discarded over field formatting.
"""

from datetime import date

from app.contracts import BillLineItem, MedicalBillExtraction


def test_us_short_dates_are_accepted() -> None:
    extraction = MedicalBillExtraction.model_validate(
        {"statement_date": "3/20/22", "due_date": "06/26/2024"}
    )

    assert extraction.statement_date == date(2022, 3, 20)
    assert extraction.due_date == date(2024, 6, 26)


def test_written_out_dates_are_accepted() -> None:
    extraction = MedicalBillExtraction.model_validate(
        {"statement_date": "June 26, 2024", "due_date": "17 Jul 2024"}
    )

    assert extraction.statement_date == date(2024, 6, 26)
    assert extraction.due_date == date(2024, 7, 17)


def test_an_unreadable_date_is_dropped_without_failing_the_document() -> None:
    """A redacted sample returns the redaction itself as the date."""
    extraction = MedicalBillExtraction.model_validate(
        {
            "statement_date": "XXXXXX",
            "due_date": "",
            "account_number": "5555555",
            "total_charges": {"amount": 406.60},
        }
    )

    assert extraction.statement_date is None
    assert extraction.due_date is None
    # The rest of the read survives, which is the whole point.
    assert extraction.account_number == "5555555"
    assert extraction.total_charges.amount == 406.60


def test_null_confidence_is_treated_as_no_score() -> None:
    extraction = MedicalBillExtraction.model_validate({"confidence": None})
    line_item = BillLineItem.model_validate({"description": "Medical care", "confidence": None})

    assert extraction.confidence == 0.0
    assert line_item.confidence == 0.0


def test_the_payload_the_model_actually_sent_now_validates() -> None:
    """Shape copied from the production response, including both faults."""
    payload = {
        "document_type": "explanation_of_benefits",
        "provider": {"name": "Acme Health Plan"},
        "statement_date": "XXXXXX",
        "date_of_service_start": "3/20/22",
        "date_of_service_end": "3/20/22",
        "total_charges": {"amount": 406.60, "currency": "USD"},
        "insurance_paid": {"amount": 120.27, "currency": "USD"},
        "patient_responsibility": {"amount": 35.00, "currency": "USD"},
        "line_items": [
            {
                "description": "Medical care",
                "service_date": "3/20/22",
                "charge": {"amount": 31.60, "currency": "USD"},
                "confidence": None,
            },
            {
                "description": "Medical care",
                "service_date": "3/20/22",
                "charge": {"amount": 375, "currency": "USD"},
                "confidence": None,
            },
        ],
        "confidence": None,
    }

    extraction = MedicalBillExtraction.model_validate(payload)

    assert len(extraction.line_items) == 2
    assert extraction.total_charges.amount == 406.60
    assert extraction.line_items[0].service_date == date(2022, 3, 20)
    assert extraction.statement_date is None
