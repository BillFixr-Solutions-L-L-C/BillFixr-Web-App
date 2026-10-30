"""Behaviour the web app relies on when it calls the engine."""

import server
from fastapi.testclient import TestClient

client = TestClient(server.app)

AUDIT = {
    "provider_name": "Example Community Health Center", "patient_name": "Jordan Example", "account_number": "INT-1",
    "total_billed": 2000.50, "patient_due": 2000.50, "issues": [],
}


def _start(**extra):
    body = {"audit_result": AUDIT, "initial_offer": 149.99, "hospital_email": "billing@hospital.example", **extra}
    return client.post("/api/negotiations/start", json=body)


def test_api_key_is_required_when_configured(monkeypatch):
    monkeypatch.setattr(server, "ENGINE_API_KEY", "secret-key")
    assert client.get("/api/negotiations").status_code == 401
    assert client.get("/api/negotiations", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/api/negotiations", headers={"X-API-Key": "secret-key"}).status_code == 200
    assert client.get("/api/health").status_code == 200  # the health check stays open


def test_start_without_commitment_creates_nothing():
    before = len(client.get("/api/negotiations").json()["negotiations"])
    resp = _start(commitment_paid=False)
    assert resp.status_code == 400
    assert len(client.get("/api/negotiations").json()["negotiations"]) == before


def test_fees_endpoint_reports_the_defaults():
    fees = client.get("/api/fees").json()
    assert fees["commitment_fee"] == 20.0
    assert fees["completion_fee_rate"] == 0.10


def test_case_fee_rate_and_payment_references_are_kept():
    started = _start(commitment_paid=True, commitment_payment_ref="pi_commit_1", completion_fee_rate=0.20).json()
    assert started["commitment_payment_ref"] == "pi_commit_1"
    neg_id = started["id"]
    client.post(f"/api/negotiations/{neg_id}/accept", json={"accepted_amount": 149.99})
    client.post(
        f"/api/negotiations/{neg_id}/reply/upload",
        data={"reply_type": "revised_bill", "reply_text": "Revised itemized bill attached."},
    )
    neg = client.get(f"/api/negotiations/{neg_id}").json()
    assert neg["status"] == "AWAITING_COMPLETION_FEE"
    assert neg["completion_fee"] == 371.0  # 20% of 1,850.51 = 370.10, rounded up

    paid = client.post(f"/api/negotiations/{neg_id}/pay/completion", json={"payment_reference": "pi_done_1"})
    assert paid.status_code == 200
    assert paid.json()["negotiation"]["completion_payment_ref"] == "pi_done_1"
