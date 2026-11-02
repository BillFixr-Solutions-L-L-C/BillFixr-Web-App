"""
Unit and integration tests for Phase 2: AI Negotiator & Inbound Communications.
"""

import pytest
from fastapi.testclient import TestClient
from server import app
from database import NegotiationRepository
from engine.negotiator import generate_hipaa_authorization, NegotiationService

client = TestClient(app)

def test_hipaa_authorization_generation():
    auth_text = generate_hipaa_authorization(
        patient_name="Jordan Example",
        provider_name="Example Community Health Center",
        account_number="0001000000000001",
        dob="1988-04-12"
    )
    assert "DESIGNATION OF AUTHORIZED REPRESENTATIVE" in auth_text
    assert "45 C.F.R. § 164.508" in auth_text
    assert "Jordan Example" in auth_text
    assert "0001000000000001" in auth_text
    assert "BillFixr" in auth_text

def test_negotiation_repository_lifecycle():
    sample_audit = {
        "provider_name": "Test Hospital",
        "patient_name": "Jane Doe",
        "account_number": "ACC-12345",
        "total_billed": 5000.00,
        "patient_due": 3000.00,
        "issues": []
    }
    
    neg = NegotiationRepository.create_negotiation(
        provider_name="Test Hospital",
        patient_name="Jane Doe",
        account_number="ACC-12345",
        total_billed=5000.00,
        patient_due=3000.00,
        initial_offer=1200.00,
        audit_result=sample_audit,
        initial_letter="Dear Billing Department...",
        hipaa_auth_text="HIPAA Authorization...",
        hospital_email="billing@test-hospital.example",
        patient_email="jane@example.com"
    )

    assert neg["id"] is not None
    assert neg["tracking_code"].startswith("BFX-")
    assert neg["status"] == "DISPATCHED"
    assert len(neg["messages"]) == 1
    assert neg["messages"][0]["direction"] == "OUTBOUND"

    # Add Inbound Message
    msg = NegotiationRepository.add_message(
        negotiation_id=neg["id"],
        direction="INBOUND",
        sender="billing@test-hospital.example",
        recipient="Jane Doe",
        subject="RE: Dispute Settlement",
        content_markdown="We counter with $1,800.00.",
        analysis={"category": "COUNTER_OFFER", "new_status": "COUNTER_OFFER_RECEIVED", "revised_balance": 1800.00}
    )
    assert msg["id"] is not None

    refreshed = NegotiationRepository.get_negotiation(neg["id"])
    assert refreshed["status"] == "COUNTER_OFFER_RECEIVED"
    assert refreshed["current_demanded_balance"] == 1800.00
    assert len(refreshed["messages"]) == 2

def test_heuristic_analysis_categories():
    svc = NegotiationService()

    # Counter offer
    res_counter = svc._heuristic_analyze_response(
        text="We reviewed your dispute. We cannot accept your offer of $500, but we can offer a settlement of $1,250.00.",
        current_offer=500.00,
        current_demanded=3000.00,
        patient_name="Jane Doe",
        provider_name="Hospital",
        account_number="12345"
    )
    assert res_counter["category"] == "COUNTER_OFFER"
    assert res_counter["hospital_counter_amount"] == 1250.00
    assert res_counter["suggested_next_offer"] > 500.00

    # Acceptance
    res_accept = svc._heuristic_analyze_response(
        text="We accept your settlement offer of $500.00 as payment in full. Please remit within 14 days.",
        current_offer=500.00,
        current_demanded=3000.00,
        patient_name="Jane Doe",
        provider_name="Hospital",
        account_number="12345"
    )
    assert res_accept["category"] == "OFFER_ACCEPTED"

    # Charity Care
    res_charity = svc._heuristic_analyze_response(
        text="To review your balance, please submit proof of income, 2025 W-2, and financial assistance application.",
        current_offer=500.00,
        current_demanded=3000.00,
        patient_name="Jane Doe",
        provider_name="Hospital",
        account_number="12345"
    )
    assert res_charity["category"] == "CHARITY_CARE_DOCS_REQUESTED"

def test_negotiation_api_full_flow():
    # 1. Start negotiation
    start_payload = {
        "audit_result": {
            "provider_name": "Metro General Hospital",
            "patient_name": "Alex Johnson",
            "account_number": "MGH-982410-A",
            "total_billed": 8640.00,
            "patient_due": 8640.00,
            "issues": []
        },
        "initial_offer": 1655.40,
        "dispute_letter": "# Formal Dispute Letter...",
        "hospital_email": "billing@metro-general.example",
        "patient_email": "alex@example.com",
        "commitment_paid": True
    }

    start_resp = client.post("/api/negotiations/start", json=start_payload)
    assert start_resp.status_code == 200
    neg_data = start_resp.json()
    neg_id = neg_data["id"]
    tracking_code = neg_data["tracking_code"]
    assert tracking_code.startswith("BFX-")

    # 2. Get detail
    get_resp = client.get(f"/api/negotiations/{neg_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == neg_id

    # 3. Inbound hospital counter-offer (Savings: 63% -> triggers Auto-Pilot acceptance)
    inbound_resp = client.post(f"/api/negotiations/{neg_id}/inbound", json={
        "message_text": "We reviewed your dispute for account MGH-982410-A. We can reduce the bill to $3,200.00 for prompt settlement.",
        "sender": "billing@metro-general.example",
        "subject": f"RE: Medical Bill Dispute [{tracking_code}]",
        "message_id": f"<{tracking_code}-hosp-reply@metro-general.example>"
    })
    assert inbound_resp.status_code == 200
    inbound_data = inbound_resp.json()
    assert inbound_data["analysis"]["category"] == "COUNTER_OFFER"
    assert inbound_data["analysis"]["is_great_deal"] is True
    assert inbound_data["analysis"]["auto_pilot_executed"] is True
    assert inbound_data["negotiation"]["status"] == "SETTLEMENT_AGREED"
    assert len(inbound_data["negotiation"]["messages"]) == 4  # Initial + Inbound + Auto-Pilot Outbound + client notice

    # 4. Optional manual counter-offer dispatch
    counter_resp = client.post(f"/api/negotiations/{neg_id}/counter", json={
        "revised_offer": 2400.00,
        "counter_letter_text": "Thank you for the discount. I can offer $2,400.00 in final resolution."
    })
    assert counter_resp.status_code == 200
    updated_neg = counter_resp.json()
    assert updated_neg["current_offer"] == 2400.00
    assert updated_neg["status"] == "COUNTER_OFFER_SENT"
    assert len(updated_neg["messages"]) == 5  # includes the client notice

    # 5. Inbound Webhook test with tracking code in subject
    webhook_resp = client.post("/api/webhooks/inbound-email", json={
        "subject": f"Final Acceptance regarding [{tracking_code}]",
        "text": "We accept your revised settlement offer of $2,400.00 in full satisfaction of this account.",
        "from": "billing@metro-general.example"
    })
    assert webhook_resp.status_code == 200
    assert webhook_resp.json()["status"] == "processed"
    assert webhook_resp.json()["category"] == "OFFER_ACCEPTED"


# --- Revised bill sent as a PDF ---

def _make_pdf(settled=149.99):
    import importlib.util
    import os
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "demo_assets", "make_revised_bill_pdf.py")
    spec = importlib.util.spec_from_file_location("make_revised_bill_pdf", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_pdf(settled=settled)


def _settled_negotiation():
    audit = {"provider_name": "Test Hospital", "patient_name": "Test Patient", "account_number": "PDF-1",
             "total_billed": 2000.50, "patient_due": 2000.50, "issues": []}
    started = client.post("/api/negotiations/start", json={
        "audit_result": audit, "initial_offer": 149.99, "dispute_letter": "",
        "hospital_email": "billing@riverside-demo.test", "commitment_paid": True,
    }).json()
    accepted = client.post(f"/api/negotiations/{started['id']}/accept", json={"accepted_amount": 149.99})
    assert accepted.status_code == 200
    return started["id"]


def test_revised_bill_pdf_is_read_and_locked_until_paid():
    neg_id = _settled_negotiation()
    resp = client.post(
        f"/api/negotiations/{neg_id}/reply/upload",
        data={"reply_type": "revised_bill", "reply_text": "Please find the revised statement attached."},
        files={"file": ("revised_bill.pdf", _make_pdf(), "application/pdf")},
    )
    assert resp.status_code == 200
    neg = resp.json()["negotiation"]
    assert neg["status"] == "AWAITING_COMPLETION_FEE"
    assert neg["completion_fee"] == 186.0  # 10% of 1,850.51, rounded up
    assert neg["revised_bill_has_pdf"] is True
    assert neg["revised_bill_check"]["passed"] is True
    assert "revised_bill_pdf_path" not in neg

    assert client.get(f"/api/negotiations/{neg_id}/revised-bill/pdf").status_code == 402
    assert client.post(f"/api/negotiations/{neg_id}/pay/completion").status_code == 200
    pdf_resp = client.get(f"/api/negotiations/{neg_id}/revised-bill/pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF")


def test_revised_bill_pdf_with_wrong_amount_asks_hospital_to_correct():
    neg_id = _settled_negotiation()
    resp = client.post(
        f"/api/negotiations/{neg_id}/reply/upload",
        data={"reply_type": "revised_bill", "reply_text": "Revised statement attached."},
        files={"file": ("revised_bill.pdf", _make_pdf(settled=200.00), "application/pdf")},
    )
    assert resp.status_code == 200
    neg = resp.json()["negotiation"]
    assert neg["status"] == "SETTLEMENT_AGREED"          # the client is not asked to pay
    assert neg["completion_fee"] is None
    assert neg["revised_bill_has_pdf"] is False
    events = [m["analysis"].get("event") for m in neg["messages"] if m["direction"] == "OUTBOUND" and m.get("analysis")]
    assert "REVISED_BILL_CORRECTION_REQUESTED" in events
