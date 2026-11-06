"""The AUTOPILOT_HOLD_FOR_REVIEW path, and getting back out of it.

Written after a production end-to-end run on 2026-11-06. A hospital
accepted $363 against a $3,400 balance -- the best outcome the product
can produce -- and the case stopped dead. The classifier had it right
(OFFER_ACCEPTED, is_great_deal, new_status HOSPITAL_ACCEPTED) and then
the hold wrote `status = HELD_FOR_REVIEW` and nothing else, so:

  * settled_amount was never recorded, so no completion fee was ever
    calculated and BillFixr could not bill the fee on a case it won;
  * no revised bill was requested, so the client never got the document
    proving the reduction;
  * the agreed figure was gone, so even a person could not finish the
    settlement -- there was nothing recording what had been agreed.

Meanwhile the web app had moved the case to `response_received` and
emailed the customer "Your provider responded". True, and the case was
finished. These tests exist so that cannot come back.
"""

import pytest

from database import NegotiationRepository
from engine.negotiator import approve_held_settlement, hold_for_review, review_blockers


DEFAULT_ISSUES = [
    {"confidence": "high", "description": "The same service appears more than once"},
    {"confidence": "needs_review", "description": "CPT 99285 looks over-coded"},
]


def make_negotiation(issues=None, **overrides):
    """A negotiation shaped like the one the 2026-11-06 production run produced."""
    audit = {
        "provider_name": "QA Test Medical Center",
        "patient_name": "Jordan Q. Testcase",
        "account_number": "ACC-REVIEW-1",
        "total_billed": 4766.0,
        "patient_due": 3400.0,
        "issues": DEFAULT_ISSUES if issues is None else issues,
        "settlement_options": {"aggressive_offer": 363.0, "fair_market_offer": 484.0},
    }
    return NegotiationRepository.create_negotiation(
        provider_name="QA Test Medical Center",
        patient_name="Jordan Q. Testcase",
        account_number="ACC-REVIEW-1",
        total_billed=4766.0,
        patient_due=3400.0,
        initial_offer=363.0,
        audit_result=audit,
        initial_letter="# Formal dispute\n\nTest letter.",
        hipaa_auth_text="Test authorisation.",
        hospital_email="delivered+qa-hospital@resend.dev",
        **overrides,
    )


def test_review_blockers_names_only_the_findings_below_high():
    neg = make_negotiation()
    assert review_blockers(neg) == ["CPT 99285 looks over-coded"]


def test_review_blockers_is_empty_when_every_finding_is_high():
    neg = make_negotiation(issues=[{"confidence": "high", "description": "Duplicate line"}])
    assert review_blockers(neg) == []


def test_hold_keeps_the_figure_the_hospital_agreed_to():
    # The regression this file exists for: before pending_settlement_amount
    # the hold stored the status alone and the agreed amount was lost.
    neg = make_negotiation()

    hold_for_review(neg["id"], neg, pending_settlement=363.0)

    held = NegotiationRepository.get_negotiation(neg["id"])
    assert held["status"] == "HELD_FOR_REVIEW"
    assert held["pending_settlement_amount"] == 363.0
    assert held["held_for_review_at"]
    assert "CPT 99285" in held["held_for_review_reason"]


def test_hold_says_why_even_with_no_settlement_pending():
    # The rejected-dispute path holds a rebuttal, not a settlement. It
    # still has to record a reason, or the case is parked with no
    # explanation anywhere.
    neg = make_negotiation()

    hold_for_review(neg["id"], neg)

    held = NegotiationRepository.get_negotiation(neg["id"])
    assert held["status"] == "HELD_FOR_REVIEW"
    assert held["pending_settlement_amount"] is None
    assert held["held_for_review_reason"]


def test_hold_tells_the_client_what_is_happening():
    neg = make_negotiation()

    hold_for_review(neg["id"], neg, pending_settlement=363.0)

    held = NegotiationRepository.get_negotiation(neg["id"])
    notices = [m for m in held["messages"] if m["direction"] == "SYSTEM"]
    assert notices, "a client waiting on a settlement should be told it is being checked"
    assert "$363.00" in notices[-1]["content_markdown"]


def test_approving_the_hold_settles_at_the_held_figure():
    # conftest sets TESTING=1, so the dispatcher records the send without
    # touching SMTP or Resend. Asserting on the stored message rather than
    # on a stubbed call checks what the case will actually show.
    neg = make_negotiation()
    hold_for_review(neg["id"], neg, pending_settlement=363.0)

    approve_held_settlement(NegotiationRepository.get_negotiation(neg["id"]))

    done = NegotiationRepository.get_negotiation(neg["id"])
    assert done["status"] == "SETTLEMENT_AGREED"
    # The figure the hospital agreed to, not one the caller chose.
    assert done["settled_amount"] == 363.0
    assert done["current_offer"] == 363.0
    # Cleared, so approving twice cannot send a second acceptance.
    assert done["pending_settlement_amount"] is None

    outbound = [m for m in done["messages"] if m["direction"] == "OUTBOUND"]
    acceptance = outbound[-1]
    assert "$363.00" in acceptance["content_markdown"]
    assert "revised itemized bill" in acceptance["content_markdown"]


def test_approving_twice_is_refused_rather_than_sending_again():
    neg = make_negotiation()
    hold_for_review(neg["id"], neg, pending_settlement=363.0)
    approve_held_settlement(NegotiationRepository.get_negotiation(neg["id"]))

    with pytest.raises(ValueError, match="Nothing is held for review"):
        approve_held_settlement(NegotiationRepository.get_negotiation(neg["id"]))


def test_approving_a_hold_with_no_agreed_figure_is_refused():
    # Settling here would commit the client to a number no hospital ever
    # offered, which is worse than leaving the case parked.
    neg = make_negotiation()
    hold_for_review(neg["id"], neg)

    with pytest.raises(ValueError, match="no agreed amount"):
        approve_held_settlement(NegotiationRepository.get_negotiation(neg["id"]))


def test_approving_a_negotiation_that_is_not_held_is_refused():
    neg = make_negotiation()

    with pytest.raises(ValueError, match="Nothing is held for review"):
        approve_held_settlement(neg)


def test_review_approve_endpoint():
    from fastapi.testclient import TestClient
    from server import app

    client = TestClient(app)

    neg = make_negotiation()
    hold_for_review(neg["id"], neg, pending_settlement=363.0)

    res = client.post(f"/api/negotiations/{neg['id']}/review/approve")

    assert res.status_code == 200
    body = res.json()
    assert body["negotiation"]["status"] == "SETTLEMENT_AGREED"
    assert body["negotiation"]["settled_amount"] == 363.0

    # Nothing left to approve -> 409, not a second send.
    assert client.post(f"/api/negotiations/{neg['id']}/review/approve").status_code == 409
    assert client.post("/api/negotiations/does-not-exist/review/approve").status_code == 404


def test_the_real_reply_path_holds_and_keeps_the_figure(monkeypatch):
    """The regression in full: a hospital acceptance arriving through
    analyze_hospital_response, with the hold switched on as production has
    it. Driving the real path matters -- the tests above call
    hold_for_review() directly, so on their own they would still pass if
    the call that records the figure were deleted again.

    OPENROUTER_API_KEY is cleared so the heuristic classifier runs and the
    test does not depend on a model or the network.
    """
    import asyncio

    from engine import negotiator as negotiator_module

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(negotiator_module, "AUTOPILOT_HOLD_FOR_REVIEW", True)

    neg = make_negotiation()
    service = negotiator_module.NegotiationService(api_key="")

    result = asyncio.run(
        service.analyze_hospital_response(
            negotiation_id=neg["id"],
            hospital_message_text=(
                "We accept your settlement offer in full and final satisfaction "
                "of this account. The balance has been adjusted accordingly."
            ),
            sender_email="billing@qa-test-medical.example",
            subject=f"Re: Formal Billing Dispute [{neg['tracking_code']}]",
        )
    )

    assert result["analysis"]["category"] == "OFFER_ACCEPTED"
    assert result["analysis"]["held_for_review"] is True

    held = NegotiationRepository.get_negotiation(neg["id"])
    assert held["status"] == "HELD_FOR_REVIEW"
    # The whole point: the agreed figure survives the hold.
    assert held["pending_settlement_amount"] == 363.0
    assert held["settled_amount"] is None, "nothing is settled until a reviewer approves it"

    # And a reviewer can finish it at that figure.
    approve_held_settlement(NegotiationRepository.get_negotiation(neg["id"]))
    done = NegotiationRepository.get_negotiation(neg["id"])
    assert done["status"] == "SETTLEMENT_AGREED"
    assert done["settled_amount"] == 363.0


def test_the_real_reply_path_settles_itself_when_nothing_needs_review(monkeypatch):
    """With every finding at high confidence the hold must not engage, or
    turning the flag on would stall every case rather than the risky ones.
    """
    import asyncio

    from engine import negotiator as negotiator_module

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(negotiator_module, "AUTOPILOT_HOLD_FOR_REVIEW", True)

    neg = make_negotiation(issues=[{"confidence": "high", "description": "Duplicate line"}])
    service = negotiator_module.NegotiationService(api_key="")

    asyncio.run(
        service.analyze_hospital_response(
            negotiation_id=neg["id"],
            hospital_message_text="We accept your settlement offer in full and final satisfaction.",
            sender_email="billing@qa-test-medical.example",
            subject=f"Re: Formal Billing Dispute [{neg['tracking_code']}]",
        )
    )

    done = NegotiationRepository.get_negotiation(neg["id"])
    assert done["status"] == "SETTLEMENT_AGREED"
    assert done["settled_amount"] == 363.0
    assert done["pending_settlement_amount"] is None
