"""
Integration tests for FastAPI endpoints in server.py.
"""

from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert isinstance(data["openrouter_configured"], bool)  # depends on whether a key is set

def test_demo_bills_list_and_get():
    resp = client.get("/api/demo-bills")
    assert resp.status_code == 200
    data = resp.json()
    assert "demo_bills" in data
    assert len(data["demo_bills"]) >= 2
    
    first_id = data["demo_bills"][0]["id"]
    single_resp = client.get(f"/api/demo-bills/{first_id}")
    assert single_resp.status_code == 200
    bill = single_resp.json()
    assert bill["id"] == first_id
    assert "line_items" in bill

def test_audit_api_endpoint():
    # Load demo bill
    bill_resp = client.get("/api/demo-bills/er-metro-general")
    bill_data = bill_resp.json()

    # Post to /api/audit
    audit_resp = client.post("/api/audit", json={
        "bill_data": bill_data,
        "user_context": None
    })
    assert audit_resp.status_code == 200
    audit = audit_resp.json()
    assert audit["audit_score"] > 0
    assert audit["total_billed"] == 8640.00
    assert len(audit["issues"]) >= 3
    assert "settlement_options" in audit

def test_generate_letter_api_endpoint():
    bill_resp = client.get("/api/demo-bills/er-metro-general")
    bill_data = bill_resp.json()

    audit_resp = client.post("/api/audit", json={"bill_data": bill_data})
    audit = audit_resp.json()

    letter_resp = client.post("/api/generate-letter", json={
        "audit_result": audit,
        "settlement_offer": 1655.40,
        "strategy": "fair_market",
        "custom_notes": "Unemployed patient."
    })
    assert letter_resp.status_code == 200
    letter_data = letter_resp.json()
    assert "letter_markdown" in letter_data
    assert len(letter_data["letter_markdown"]) > 200
    assert letter_data["settlement_offer"] == 1655.40

def test_static_index_serves_html():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "BillFixr" in resp.text
