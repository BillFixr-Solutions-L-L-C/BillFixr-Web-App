"""A hospital reply that arrives on paper must actually be read.

Until 2026-11-10 POST /api/negotiations/{id}/reply/upload read the uploaded
file into a variable, discarded it, and substituted the fixed string
"[OCR Extracted from <name>]: Scanned written response from hospital billing
office." The rest of the handler keyword-matched *that sentence* and
returned a hardcoded category, a hardcoded summary ("Hospital offered
revised settlement of $250.00.") and a hardcoded FQHC pushback letter
quoting $175.00 -- the same answer for every reply, whatever the hospital
had written.

It now transcribes the document with the vision model and hands the real
words to analyze_hospital_response, which is the same analysis an emailed
reply has always gone through.

Every test here fails against the old handler.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def _negotiation(initial_offer: float = 400.00, total: float = 1200.00) -> str:
    audit = {
        "provider_name": "Test Hospital",
        "patient_name": "Test Patient",
        "account_number": "REPLY-1",
        "total_billed": total,
        "patient_due": total,
        "issues": [],
    }
    started = client.post(
        "/api/negotiations/start",
        json={
            "audit_result": audit,
            "initial_offer": initial_offer,
            "dispute_letter": "",
            "hospital_email": "billing@riverside-demo.test",
            "commitment_paid": True,
        },
    ).json()
    return started["id"]


def _upload(neg_id: str, **kwargs: Any):
    return client.post(f"/api/negotiations/{neg_id}/reply/upload", **kwargs)


# --- the document is read -------------------------------------------------


def test_the_uploaded_file_is_transcribed_and_its_words_are_analysed() -> None:
    neg_id = _negotiation()
    letter = (
        "Riverside General Hospital, Patient Financial Services.\n"
        "We have reviewed account REPLY-1 and will reduce the balance to $610.00."
    )

    with patch(
        "server.vision_extractor.read_document_text", new=AsyncMock(return_value=letter)
    ) as read_doc, patch(
        "server.negotiation_service.analyze_hospital_response", new=AsyncMock()
    ) as analyse:
        analyse.return_value = {
            "analysis": {"category": "COUNTER_OFFER", "summary": "Hospital offered $610.00."},
            "proposed_action": {"recommendation": "Counter at $450.00."},
        }
        resp = _upload(neg_id, files={"file": ("reply.png", b"\x89PNGfake", "image/png")})

    assert resp.status_code == 200, resp.text
    # The file reached the transcriber at all -- the old handler never
    # looked at the bytes.
    assert read_doc.await_count == 1
    (files_data,) = read_doc.await_args.args
    assert files_data == [(b"\x89PNGfake", "reply.png")]
    # And the transcription, not a placeholder, is what was analysed.
    assert analyse.await_args.kwargs["hospital_message_text"] == letter
    assert "$610.00" in analyse.await_args.kwargs["hospital_message_text"]


def test_the_answer_comes_from_the_analysis_not_a_fixed_string() -> None:
    neg_id = _negotiation()

    with patch(
        "server.vision_extractor.read_document_text", new=AsyncMock(return_value="We decline.")
    ), patch("server.negotiation_service.analyze_hospital_response", new=AsyncMock()) as analyse:
        analyse.return_value = {
            "analysis": {"category": "DISPUTE_REJECTED", "summary": "Hospital declined the dispute."},
            "proposed_action": {"recommendation": "Escalate with a statutory citation."},
        }
        body = _upload(neg_id, data={"reply_text": "We decline."}).json()

    assert body["category"] == "DISPUTE_REJECTED"
    assert body["summary"] == "Hospital declined the dispute."
    assert body["recommendation"] == "Escalate with a statutory citation."
    # The old handler answered this with "Hospital offered revised
    # settlement of $250.00." and a $175.00 FQHC letter.
    assert "250.00" not in str(body)
    assert "175.00" not in str(body)


def test_a_typed_note_and_a_scan_are_both_sent() -> None:
    neg_id = _negotiation()

    with patch(
        "server.vision_extractor.read_document_text", new=AsyncMock(return_value="Scanned page text.")
    ), patch("server.negotiation_service.analyze_hospital_response", new=AsyncMock()) as analyse:
        analyse.return_value = {"analysis": {}, "proposed_action": {}}
        _upload(
            neg_id,
            data={"reply_text": "Support note: arrived by fax 12 Nov."},
            files={"file": ("reply.png", b"\x89PNGfake", "image/png")},
        )

    text = analyse.await_args.kwargs["hospital_message_text"]
    assert "Scanned page text." in text
    assert "Support note: arrived by fax 12 Nov." in text


def test_the_reply_is_threaded_onto_the_existing_conversation() -> None:
    neg_id = _negotiation()

    with patch(
        "server.vision_extractor.read_document_text", new=AsyncMock(return_value="Noted.")
    ), patch("server.negotiation_service.analyze_hospital_response", new=AsyncMock()) as analyse:
        analyse.return_value = {"analysis": {}, "proposed_action": {}}
        _upload(neg_id, data={"reply_text": "Noted."})

    kwargs = analyse.await_args.kwargs
    # Without these the hospital's reply starts a new thread and the
    # provider sees two unrelated conversations.
    assert kwargs["inbound_in_reply_to"]
    assert kwargs["inbound_references"]
    assert kwargs["sender_email"] == "billing@riverside-demo.test"


# --- it refuses rather than inventing -------------------------------------


def test_an_unreadable_document_is_reported_not_papered_over() -> None:
    neg_id = _negotiation()

    with patch(
        "server.vision_extractor.read_document_text",
        new=AsyncMock(side_effect=RuntimeError("OpenRouter API error (HTTP 503)")),
    ), patch("server.negotiation_service.analyze_hospital_response", new=AsyncMock()) as analyse:
        resp = _upload(neg_id, files={"file": ("reply.png", b"\x89PNGfake", "image/png")})

    assert resp.status_code == 502
    assert "Could not read the uploaded document" in resp.json()["detail"]
    # Nothing was analysed, so nothing was written to the case file claiming
    # the hospital had said something.
    assert analyse.await_count == 0


def test_an_empty_submission_is_refused() -> None:
    neg_id = _negotiation()

    with patch("server.negotiation_service.analyze_hospital_response", new=AsyncMock()) as analyse:
        resp = _upload(neg_id, data={"reply_text": "   "})

    # The old handler turned this into "Hospital billing department
    # submitted written correspondence." and analysed it as if the hospital
    # had written it.
    assert resp.status_code == 400
    assert analyse.await_count == 0


def test_an_unknown_negotiation_is_a_404_and_reads_nothing() -> None:
    with patch("server.vision_extractor.read_document_text", new=AsyncMock()) as read_doc:
        resp = _upload("no-such-negotiation", data={"reply_text": "Hello."})

    assert resp.status_code == 404
    assert read_doc.await_count == 0


# --- the revised-bill branch is untouched ---------------------------------


def test_a_revised_bill_is_not_sent_to_the_transcriber() -> None:
    """process_revised_bill reads the PDF itself and checks it against the
    agreed figure. Transcribing first would spend a vision call on a
    document about to be read properly -- and in a deployment without a
    vision key it would fail the upload outright."""
    neg_id = _negotiation()

    with patch("server.vision_extractor.read_document_text", new=AsyncMock()) as read_doc:
        resp = _upload(
            neg_id,
            data={"reply_type": "revised_bill", "reply_text": "Revised statement attached."},
            files={"file": ("revised.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert read_doc.await_count == 0
    # 400 because this negotiation has not reached SETTLEMENT_AGREED -- the
    # point is that the guard, not the transcriber, is what answered.
    assert resp.status_code == 400
    assert "settlement is agreed" in resp.json()["detail"]
