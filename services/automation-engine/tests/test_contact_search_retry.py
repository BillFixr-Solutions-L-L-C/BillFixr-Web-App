"""A billing contact must be a billing contact, and one try is not enough.

On 2026-11-11 a search for Matthew Walker Comprehensive Health Center put
`shatiqua.jamerson@mwchc.org` into the form as the hospital's support
email. That is a named member of staff, read off npin.cdc.gov -- the CDC's
prevention-services directory, which has nothing to do with billing.
Meanwhile the billing field, which is the one that matters, came back
empty.

Two gaps. Nothing knew a personal mailbox is the wrong kind of answer, and
the search gave up after a single general question.

Both are covered here. Every test fails against the old behaviour.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from engine import contact_search
from engine.contact_search import (
    EmailFind,
    is_personal_address,
    is_role_address,
    search_emails,
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.delenv("CONTACT_SEARCH_MAX_ATTEMPTS", raising=False)
    contact_search._cache.clear()
    yield
    contact_search._cache.clear()


def reply(billing: str | None = None, support: str | None = None, url: str = "https://mwchc.org/billing"):
    """An OpenRouter answer carrying whatever addresses a test wants."""
    body: Dict[str, Any] = {}
    body["billing"] = {"email": billing, "source_url": url} if billing else None
    body["support"] = {"email": support, "source_url": url} if support else None
    import json

    return {"choices": [{"message": {"content": json.dumps(body)}}]}


# --- what counts as a billing contact ------------------------------------


@pytest.mark.parametrize(
    "email",
    ["billing@mwchc.org", "patientbilling@partners.org", "support@x.org", "patient.accounts@x.org", "info@x.org"],
)
def test_a_department_mailbox_is_a_role_address(email):
    assert is_role_address(email)
    assert not is_personal_address(email)


@pytest.mark.parametrize(
    "email",
    ["shatiqua.jamerson@mwchc.org", "j.smith@x.org", "jsmith@x.org", "maria-lopez@x.org"],
)
def test_a_named_person_is_not(email):
    assert is_personal_address(email)
    assert not is_role_address(email)


def test_a_role_word_wins_over_a_personal_shape():
    # Punctuated like a person, but it is a department.
    assert not is_personal_address("billing.office@x.org")
    # And a person's mailbox that is explicitly the billing one is fine.
    assert not is_personal_address("john.smith.billing@x.org")


# --- a named person never reaches the form -------------------------------


def test_a_personal_address_is_refused_outright():
    # The exact address that reached the form. It is on the provider's own
    # domain, so the domain check would not have stopped it; only knowing
    # it names a person does.
    assert contact_search._verify("shatiqua.jamerson@mwchc.org", "https://npin.cdc.gov/x") is None


def test_a_personal_address_is_refused_even_from_the_providers_own_page(tmp_path):
    # Not "unconfirmed and shown". Refused. Confirming it would only
    # confirm that a stranger's address is published somewhere.
    with patch.object(contact_search, "_fetch_page", return_value="shatiqua.jamerson@mwchc.org"):
        assert contact_search._verify("shatiqua.jamerson@mwchc.org", "https://mwchc.org/staff") is None


def test_a_department_address_on_a_third_party_page_is_still_offered():
    # The behaviour added when unconfirmed finds started being shown
    # stays: a real billing mailbox we could not check is the customer's
    # to judge, and binning it was throwing away good answers.
    found = contact_search._verify("billing@mwchc.org", "https://npin.cdc.gov/x")
    assert found is not None
    assert found.confirmed is False
    assert "npin.cdc.gov" in found.reason


# --- it searches more than once ------------------------------------------


def test_it_tries_again_when_the_first_pass_finds_no_billing_address():
    calls: List[str] = []

    def fake_chat(payload, _key):
        calls.append(payload["messages"][1]["content"])
        # First pass: only a named person, which is refused.
        if len(calls) == 1:
            return reply(support="shatiqua.jamerson@mwchc.org", url="https://npin.cdc.gov/x")
        return reply(billing="billing@mwchc.org")

    with patch.object(contact_search, "_chat", side_effect=fake_chat), patch.object(
        contact_search, "_fetch_page", return_value="billing@mwchc.org"
    ):
        found = search_emails("Matthew Walker Comprehensive Health Center")

    assert len(calls) >= 2, "gave up after one search"
    assert found["billing"].email == "billing@mwchc.org"
    assert found["billing"].confirmed is True
    assert "support" not in found, "the named person must not survive"


def test_the_second_pass_looks_somewhere_different():
    # Re-rolling the same question would only buy the same answer at the
    # same price.
    calls: List[str] = []

    def fake_chat(payload, _key):
        calls.append(payload["messages"][1]["content"])
        return reply()

    with patch.object(contact_search, "_chat", side_effect=fake_chat):
        search_emails("Some Clinic")

    assert len(calls) == 3
    assert len(set(calls)) == 3, "the attempts asked the same thing"
    assert "Pay My Bill" in calls[1]
    assert "Patient Financial Services" in calls[2]


def test_it_stops_as_soon_as_it_has_a_confirmed_billing_address():
    # Every pass costs a web search.
    calls = []

    def fake_chat(payload, _key):
        calls.append(1)
        return reply(billing="billing@mwchc.org")

    with patch.object(contact_search, "_chat", side_effect=fake_chat), patch.object(
        contact_search, "_fetch_page", return_value="billing@mwchc.org"
    ):
        search_emails("Matthew Walker Comprehensive Health Center")

    assert len(calls) == 1


def test_it_keeps_looking_when_all_it_has_is_unconfirmed():
    # An unconfirmed address is worth having, but it is worth one more
    # search to try to better it.
    calls = []

    def fake_chat(payload, _key):
        calls.append(1)
        if len(calls) == 1:
            # Right domain, wrong page: unconfirmed.
            return reply(billing="billing@mwchc.org", url="https://directory.example/x")
        return reply(billing="billing@mwchc.org", url="https://mwchc.org/pay-my-bill")

    with patch.object(contact_search, "_chat", side_effect=fake_chat), patch.object(
        contact_search, "_fetch_page", return_value="billing@mwchc.org"
    ):
        found = search_emails("Matthew Walker Comprehensive Health Center")

    assert len(calls) == 2
    # The better one won.
    assert found["billing"].confirmed is True


def test_it_gives_up_rather_than_inventing_an_address():
    # The whole point of the cap. Searching until the model produces
    # something is how a plausible `billing@<hospital>.org` ends up on a
    # letter containing someone's account number and balance.
    calls = []

    def fake_chat(payload, _key):
        calls.append(1)
        return reply()

    with patch.object(contact_search, "_chat", side_effect=fake_chat):
        found = search_emails("A Clinic With No Published Email")

    assert found == {}
    assert len(calls) == 3, "unbounded retries"


def test_the_attempt_count_is_configurable(monkeypatch):
    monkeypatch.setenv("CONTACT_SEARCH_MAX_ATTEMPTS", "1")
    calls = []

    with patch.object(contact_search, "_chat", side_effect=lambda *_: (calls.append(1), reply())[1]):
        search_emails("Some Clinic")

    assert len(calls) == 1


def test_the_address_on_the_bill_reaches_every_attempt():
    # Searching a name alone returned the Nashville campus for a Smyrna
    # clinic, and that has to hold for the later passes too.
    calls: List[str] = []

    with patch.object(
        contact_search, "_chat", side_effect=lambda p, _k: (calls.append(p["messages"][1]["content"]), reply())[1]
    ):
        search_emails("Matthew Walker", address="1035 14th Ave N, Nashville, TN")

    assert len(calls) == 3
    assert all("1035 14th Ave N" in c for c in calls)


def test_a_failing_attempt_does_not_stop_the_next_one():
    calls = []

    def fake_chat(payload, _key):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("OpenRouter 503")
        return reply(billing="billing@mwchc.org")

    with patch.object(contact_search, "_chat", side_effect=fake_chat), patch.object(
        contact_search, "_fetch_page", return_value="billing@mwchc.org"
    ):
        found = search_emails("Matthew Walker Comprehensive Health Center")

    assert found["billing"].email == "billing@mwchc.org"


def test_the_whole_search_is_cached_so_a_second_press_costs_nothing():
    calls = []

    with patch.object(contact_search, "_chat", side_effect=lambda *_: (calls.append(1), reply())[1]):
        search_emails("Some Clinic")
        first = len(calls)
        search_emails("Some Clinic")

    assert len(calls) == first
