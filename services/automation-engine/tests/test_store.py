"""The store itself: the dialect layer, and the repository methods that moved out of server.py.

Everything here runs twice in CI, once per backend (see conftest.py). The
tests that care which backend they are on read database.POSTGRES rather
than guessing, because the point of the pair of runs is that neither one
gets to be the only opinion.
"""

import pytest
from fastapi.testclient import TestClient

import database
from database import NegotiationRepository
from server import app

client = TestClient(app)


def make_negotiation(total_billed=4766.0, patient_due=3400.0, **overrides):
    """A dispatched negotiation with its opening letter on the timeline.

    Deliberately not imported from test_review_hold: that helper fixes the
    amounts, and the precision test here needs to choose them.
    """
    audit = {
        "provider_name": "QA Test Medical Center",
        "patient_name": "Jordan Q. Testcase",
        "account_number": "ACC-STORE-1",
        "total_billed": total_billed,
        "patient_due": patient_due,
        "issues": [{"confidence": "high", "description": "Duplicate line"}],
        "settlement_options": {"aggressive_offer": 363.0, "fair_market_offer": 484.0},
    }
    return NegotiationRepository.create_negotiation(
        provider_name="QA Test Medical Center",
        patient_name="Jordan Q. Testcase",
        account_number="ACC-STORE-1",
        total_billed=total_billed,
        patient_due=patient_due,
        initial_offer=363.0,
        audit_result=audit,
        initial_letter="# Formal dispute\n\nTest letter.",
        hipaa_auth_text="Test authorisation.",
        hospital_email="delivered+qa-hospital@resend.dev",
        **overrides,
    )


# --- the dialect layer -------------------------------------------------


def test_placeholders_are_translated_only_for_postgres():
    sql = "UPDATE negotiations SET status = ? WHERE id = ?"
    if database.POSTGRES:
        assert database._translate(sql) == "UPDATE negotiations SET status = %s WHERE id = %s"
    else:
        # SQLite runs the statement as written; nothing calls _translate.
        assert "?" in sql


def test_a_literal_percent_is_refused_rather_than_mangled():
    """psycopg reads % as a placeholder, so an inlined LIKE pattern would
    break on Postgres only. Better to fail loudly in both runs."""
    with pytest.raises(ValueError, match="literal '%'"):
        database._translate("SELECT * FROM negotiations WHERE provider_name LIKE 'St %'")


def test_money_columns_are_double_precision_on_postgres():
    ddl = "total_billed REAL NOT NULL"
    if database.POSTGRES:
        assert database._ddl(ddl) == "total_billed DOUBLE PRECISION NOT NULL"
    else:
        assert database._ddl(ddl) == ddl


def test_ddl_leaves_text_and_integer_alone():
    assert database._ddl("admin_notes TEXT") == "admin_notes TEXT"
    assert database._ddl("cadence_step INTEGER DEFAULT 0") == "cadence_step INTEGER DEFAULT 0"


def test_a_large_bill_survives_the_round_trip_to_the_cent():
    """Why _ddl exists.

    SQLite's REAL is a 64-bit float; Postgres's REAL is 32-bit, with a
    24-bit mantissa. At 2**17 = 131072 the gap between neighbouring values
    is 2**-6 = 0.015625, which is wider than a cent -- so from $131,072 up,
    a single-precision column cannot represent cents at all. $187,654.21
    comes back as $187,654.20, and $999,999.99 comes back as $1,000,000.00.

    That range is not hypothetical for this product: it negotiates exactly
    the bills that reach six figures, and every number downstream -- the
    saving, the 20% fee on it, the figure quoted in the letter -- is
    computed from these two columns. Measured on Postgres 16 rather than
    assumed: amounts below the threshold do survive a REAL column, because
    Postgres emits the shortest decimal that round-trips, which is what
    makes this failure quiet enough to ship.
    """
    neg = make_negotiation(total_billed=999999.99, patient_due=187654.21)
    stored = NegotiationRepository.get_negotiation(neg["id"])
    assert stored["total_billed"] == 999999.99
    assert stored["original_balance_due"] == 187654.21


# --- repository methods that used to be raw SQL in server.py -----------


def test_set_support_email_is_stored_and_read_back():
    neg = make_negotiation()
    NegotiationRepository.set_support_email(neg["id"], "support@billfixr.com")
    assert NegotiationRepository.get_negotiation(neg["id"])["support_email"] == "support@billfixr.com"


def test_reconcile_rewrites_the_negotiation_and_its_first_message_together():
    """The thread root has to agree in both tables.

    Resend assigns its own Message-ID and ignores the engine's. If only the
    negotiation were rewritten, the message row would still carry the
    invented id, and a reply quoting the real one would match neither --
    the poller would ingest nothing and no one would be told.
    """
    neg = make_negotiation()
    invented = neg["root_message_id"]
    real = "<real-id-from-resend@billfixr.com>"
    assert invented and invented != real

    NegotiationRepository.reconcile_root_message_id(neg["id"], real, invented)

    after = NegotiationRepository.get_negotiation(neg["id"])
    assert after["root_message_id"] == real
    assert after["last_message_id"] == real
    outbound = [m for m in after["messages"] if m["direction"] == "OUTBOUND"]
    assert outbound, "the opening letter should still be on the timeline"
    assert outbound[0]["message_id_header"] == real
    assert outbound[0]["references_header"] == real


def test_reconcile_leaves_a_later_message_alone():
    """It matches on the old id, so only the message it rooted is rewritten."""
    neg = make_negotiation()
    NegotiationRepository.add_message(
        negotiation_id=neg["id"],
        direction="INBOUND",
        sender="billing@example.org",
        recipient="advocate@billfixr.com",
        subject="Re: dispute",
        content_markdown="We are reviewing.",
        message_id_header="<hospital-reply@example.org>",
    )
    NegotiationRepository.reconcile_root_message_id(
        neg["id"], "<real-id@billfixr.com>", neg["root_message_id"]
    )

    after = NegotiationRepository.get_negotiation(neg["id"])
    inbound = [m for m in after["messages"] if m["direction"] == "INBOUND"]
    assert inbound[0]["message_id_header"] == "<hospital-reply@example.org>"


# --- the edit-field allowlist ------------------------------------------


def test_an_allowed_field_is_written():
    neg = make_negotiation()
    NegotiationRepository.set_editable_field(neg["id"], "admin_notes", "Called the billing office.")
    assert NegotiationRepository.get_negotiation(neg["id"])["admin_notes"] == "Called the billing office."


def test_an_unlisted_field_is_refused():
    neg = make_negotiation()
    with pytest.raises(ValueError, match="not an editable field"):
        NegotiationRepository.set_editable_field(neg["id"], "status", "SETTLED")


@pytest.mark.parametrize(
    "field",
    [
        "settled_amount",
        "completion_paid",
        "commitment_paid",
        "completion_fee_rate",
        "pending_settlement_amount",
    ],
)
def test_money_and_paywall_columns_are_not_editable_by_hand(field):
    """Each of these has an endpoint that records why it changed and keeps
    the fee arithmetic consistent. Editing them as free text would walk
    past the lot -- marking a case paid, or changing what was agreed, with
    no record of who did it or why."""
    neg = make_negotiation()
    with pytest.raises(ValueError, match="not an editable field"):
        NegotiationRepository.set_editable_field(neg["id"], field, 1)


def test_the_column_name_cannot_carry_sql():
    """The column name is interpolated, because a placeholder cannot stand
    in for an identifier. The allowlist is therefore the whole defence, and
    this is the payload it has to stop."""
    neg = make_negotiation()
    before = NegotiationRepository.get_negotiation(neg["id"])["provider_name"]
    with pytest.raises(ValueError, match="not an editable field"):
        NegotiationRepository.set_editable_field(
            neg["id"], "provider_name = 'pwned', status", "SETTLED"
        )
    assert NegotiationRepository.get_negotiation(neg["id"])["provider_name"] == before


def test_edit_field_endpoint_answers_400_for_a_refused_field():
    neg = make_negotiation()
    resp = client.post(
        f"/api/negotiations/{neg['id']}/edit-field",
        json={"field": "settled_amount", "new_value": 1.0, "reason": "trying it on"},
    )
    assert resp.status_code == 400
    assert "not an editable field" in resp.json()["detail"]


def test_edit_field_endpoint_accepts_an_allowed_field():
    neg = make_negotiation()
    resp = client.post(
        f"/api/negotiations/{neg['id']}/edit-field",
        json={
            "field": "hospital_email",
            "new_value": "billing@example.org",
            "reason": "the first address bounced",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["negotiation"]["hospital_email"] == "billing@example.org"
    # The edit is still recorded in the audit history, as before.
    assert body["edit"]["field"] == "hospital_email"
    assert body["edit"]["reason"] == "the first address bounced"
