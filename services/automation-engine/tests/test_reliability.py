"""Failure modes that cost a customer or a hospital something real.

Each of these used to be a way for the engine to look healthy while a paid
case went wrong: a retry that wrote to the hospital twice, a bad record that
stopped every other follow-up, a model answer that was not a bill.
"""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import server
from engine.vision_extractor import VisionExtractor

client = TestClient(server.app)

AUDIT = {
    "provider_name": "Reliable Community Hospital", "patient_name": "Jordan Example", "account_number": "REL-1",
    "total_billed": 1800.0, "patient_due": 1800.0, "issues": [],
}


def _start(case_id, **extra):
    body = {
        "audit_result": AUDIT, "initial_offer": 120.0, "hospital_email": "billing@hospital.example",
        "commitment_paid": True, "external_ref": case_id, **extra,
    }
    return client.post("/api/negotiations/start", json=body)


# --- starting a negotiation twice must not write to the hospital twice ----

def test_starting_the_same_case_twice_returns_the_same_negotiation_and_sends_once():
    case_id = str(uuid.uuid4())
    with patch.object(server.email_dispatcher, "dispatch_dispute_packet", wraps=server.email_dispatcher.dispatch_dispute_packet) as send:
        first = _start(case_id)
        second = _start(case_id)

    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert send.call_count == 1, "a repeated start must not send a second dispute letter"


def test_different_cases_get_different_negotiations():
    a, b = _start(str(uuid.uuid4())), _start(str(uuid.uuid4()))
    assert a.json()["id"] != b.json()["id"]


# --- one bad negotiation must not stop the others -------------------------

def test_the_autopilot_sweep_survives_a_record_that_raises(monkeypatch):
    ticked = []

    items = [
        {"id": "bad", "auto_pilot_enabled": 1, "status": "DISPATCHED"},
        {"id": "good", "auto_pilot_enabled": 1, "status": "DISPATCHED"},
    ]

    def fake_get(nid):
        if nid == "bad":
            raise ValueError("malformed record")
        return {"id": nid, "messages": []}

    async def fake_tick(nid):
        ticked.append(nid)

    monkeypatch.setattr(server.NegotiationRepository, "list_negotiations", staticmethod(lambda: items))
    monkeypatch.setattr(server.NegotiationRepository, "get_negotiation", staticmethod(fake_get))
    monkeypatch.setattr(server, "_cadence_due", lambda neg: True)
    monkeypatch.setattr(server, "cadence_tick", fake_tick)
    monkeypatch.setattr(server, "AUTOPILOT_CHECK_SECONDS", 0)

    async def run_one_pass():
        real_sleep = asyncio.sleep
        calls = {"n": 0}

        async def stop_after_first_pass(delay):
            calls["n"] += 1
            if calls["n"] >= 2:  # 1st is the startup delay, 2nd ends the first pass
                raise asyncio.CancelledError
            await real_sleep(0)

        monkeypatch.setattr(server.asyncio, "sleep", stop_after_first_pass)
        task = await server.start_autopilot_loop()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run_one_pass())
    assert ticked == ["good"], "the record after the failing one must still be processed"


# --- the bill reading: a 200 that is not a bill is retried ----------------

GOOD = {"provider_name": "H", "total_billed": 500.0, "line_items": [{"description": "x", "charge_amount": 500.0}]}


def test_parser_repairs_a_truncated_reply():
    raw = '{"total_billed": 10, "line_items": [{"description": "a", "charge_amount": 10}, {"description": "b"'
    parsed = VisionExtractor._parse_model_json(raw)
    assert parsed["total_billed"] == 10


def test_parser_rejects_prose():
    with pytest.raises(ValueError):
        VisionExtractor._parse_model_json("I'm sorry, I can't read this image.")


@pytest.mark.parametrize("data,ok", [({}, False), ({"line_items": []}, False), ({"total_billed": 0}, False),
                                     (GOOD, True), ({"total_billed": 12.5}, True)])
def test_what_counts_as_a_reading(data, ok):
    assert VisionExtractor._looks_like_a_bill(data) is ok


def _response(status, content=None):
    r = MagicMock()
    r.status_code = status
    r.text = "err"
    r.json.return_value = {"choices": [{"message": {"content": content}}]}
    return r


def _extractor(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    ex = VisionExtractor(api_key="test-key")
    monkeypatch.setattr(ex, "process_multiple_files", lambda files: ["data:image/png;base64,AAAA"], raising=False)
    return ex


def _run_with_replies(ex, replies, monkeypatch):
    async def no_sleep(_):
        return None

    monkeypatch.setattr("engine.vision_extractor.asyncio.sleep", no_sleep)
    post = AsyncMock(side_effect=replies)
    with patch("engine.vision_extractor.httpx.AsyncClient") as client_cls:
        client_cls.return_value.__aenter__.return_value.post = post
        result = asyncio.run(ex.extract_bill_multi([(b"x", "bill.png")]))
    return result, post


def test_an_unusable_200_falls_through_to_the_next_model(monkeypatch):
    ex = _extractor(monkeypatch)
    result, post = _run_with_replies(
        ex, [_response(200, "{}"), _response(200, json.dumps(GOOD))], monkeypatch
    )
    assert result["total_billed"] == 500.0
    assert post.call_count == 2


def test_a_server_error_then_a_good_reading_succeeds(monkeypatch):
    ex = _extractor(monkeypatch)
    result, _ = _run_with_replies(ex, [_response(503), _response(200, json.dumps(GOOD))], monkeypatch)
    assert result["line_items"]


def test_it_gives_up_with_a_clear_error_after_every_attempt_fails(monkeypatch):
    ex = _extractor(monkeypatch)
    with pytest.raises(RuntimeError, match="could not be read after 3 attempts"):
        _run_with_replies(ex, [_response(200, "nonsense")] * 3, monkeypatch)
