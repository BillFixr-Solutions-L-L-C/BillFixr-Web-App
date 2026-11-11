"""A hospital with no billing email still has somewhere to post a letter.

Matthew Walker Comprehensive Health Center publishes no billing email. The
search now makes three targeted passes and still finds none -- which is a
correct answer, not a failure. What it leaves the customer with is a postal
address, and that is the only thing that unblocks the case.

The address the NPI registry holds is where a provider is REGISTERED with
CMS, usually the clinic itself. That is not the same as where it asks
patients to send billing mail: Mass General Brigham asks for post to
Patient Billing Solutions in Somerville, not to the hospital. A dispute
sent to a hospital's front desk goes unread.

So the search now looks for a remit-to address as well, and checks it the
same way it checks an email -- against the page that published it.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from engine import contact_search
from engine.contact_search import AddressFind, search_emails

PAGE = (
    "<html><body><h1>Pay My Bill</h1>"
    "<p>Mail your payment to: Patient Billing Solutions, "
    "399 Revolution Drive, Suite 410, Somerville, MA 02145-1462</p>"
    "</body></html>"
)
ADDRESS = "Patient Billing Solutions, 399 Revolution Drive, Suite 410, Somerville, MA 02145-1462"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.delenv("CONTACT_SEARCH_MAX_ATTEMPTS", raising=False)
    # _is_public_url resolves the hostname, so leaving it real makes every
    # test here depend on DNS: the first run took 155 seconds and failed
    # four tests because the example domain does not resolve. The guard
    # itself is tested on its own below, against a loopback literal that
    # needs no lookup.
    monkeypatch.setattr(contact_search, "_is_public_url", lambda url: not url.startswith("http://127."))
    contact_search._cache.clear()
    yield
    contact_search._cache.clear()


def reply(address: str | None = ADDRESS, url: str = "https://mgb.org/pay-my-bill", remit: bool = True, email=None):
    body: Dict[str, Any] = {
        "billing": {"email": email, "source_url": url} if email else None,
        "support": None,
        "billing_address": {"address": address, "source_url": url, "is_remit_to": remit} if address else None,
    }
    return {"choices": [{"message": {"content": json.dumps(body)}}]}


# --- checking an address --------------------------------------------------


def test_an_address_on_the_page_that_published_it_is_confirmed():
    with patch.object(contact_search, "_fetch_page", return_value=PAGE):
        found = contact_search._verify_address(ADDRESS, "https://mgb.org/pay-my-bill", True)

    assert isinstance(found, AddressFind)
    assert found.confirmed is True
    assert found.is_remit_to is True


def test_formatting_differences_do_not_sink_a_real_address():
    # A page writes an address across several lines, inside tags, with or
    # without a comma after the city. Comparing raw strings would reject
    # addresses that are plainly there.
    split_page = (
        "<address>Patient Billing Solutions<br>399 Revolution Drive<br>"
        "Suite 410<br>Somerville&nbsp;MA&nbsp;02145-1462</address>"
    )
    with patch.object(contact_search, "_fetch_page", return_value=split_page):
        found = contact_search._verify_address(ADDRESS, "https://mgb.org/pay-my-bill", True)

    assert found.confirmed is True


def test_an_address_not_on_its_page_comes_back_unconfirmed_not_dropped():
    # Same contract as an email: the customer can open the page we could
    # not read properly, so the address is shown with the reason.
    with patch.object(contact_search, "_fetch_page", return_value="<html>nothing here</html>"):
        found = contact_search._verify_address(ADDRESS, "https://mgb.org/pay-my-bill", True)

    assert found is not None
    assert found.confirmed is False
    assert "does not appear" in found.reason


def test_a_page_that_cannot_be_read_leaves_the_address_unconfirmed():
    with patch.object(contact_search, "_fetch_page", side_effect=TimeoutError("slow")):
        found = contact_search._verify_address(ADDRESS, "https://mgb.org/pay-my-bill", True)

    assert found.confirmed is False
    assert "could not be read" in found.reason


def test_an_address_with_no_zip_is_refused():
    # The giveaway for something invented rather than read. A real US
    # billing address printed for patients to post to always has one.
    assert contact_search._verify_address("399 Revolution Drive, Somerville MA", "https://mgb.org/x", True) is None


def test_an_address_with_no_source_is_refused():
    assert contact_search._verify_address(ADDRESS, "", True) is None


def test_a_private_network_url_is_never_fetched():
    fetched: List[str] = []

    with patch.object(contact_search, "_fetch_page", side_effect=lambda u: fetched.append(u)):
        found = contact_search._verify_address(ADDRESS, "http://127.0.0.1/admin", True)

    assert fetched == []
    assert found.confirmed is False


def test_the_real_public_url_guard_rejects_loopback(monkeypatch):
    # The fixture above stubs _is_public_url so these tests do not need
    # DNS. This one calls the real thing, on an IP literal that needs no
    # lookup, so the guard is not left untested by that stub.
    monkeypatch.undo()
    assert contact_search._is_public_url("http://127.0.0.1/admin") is False
    assert contact_search._is_public_url("http://169.254.169.254/latest/meta-data") is False


def test_the_zip_alone_is_not_enough():
    # A ZIP covers a whole district; on its own it proves nothing about
    # this address being on this page.
    page = "<p>Somerville, MA 02145-1462 is our catchment area.</p>"
    with patch.object(contact_search, "_fetch_page", return_value=page):
        found = contact_search._verify_address(ADDRESS, "https://mgb.org/x", True)

    assert found.confirmed is False


# --- it comes back from the search ---------------------------------------


def test_the_search_returns_a_postal_address():
    with patch.object(contact_search, "_chat", return_value=reply()), patch.object(
        contact_search, "_fetch_page", return_value=PAGE
    ):
        found = search_emails("Mass General Brigham")

    assert found["billing_address"].address == ADDRESS
    assert found["billing_address"].is_remit_to is True


def test_a_remit_to_address_beats_the_hospitals_street_address():
    # The whole distinction. The street address is where the building is;
    # the remit-to address is where billing post is opened.
    calls = []

    def fake_chat(payload, _key):
        calls.append(1)
        if len(calls) == 1:
            return reply(address="55 Fruit Street, Boston, MA 02114", url="https://mgb.org/contact", remit=False)
        return reply()

    with patch.object(contact_search, "_chat", side_effect=fake_chat), patch.object(
        contact_search, "_fetch_page", return_value=PAGE + "55 Fruit Street Boston MA 02114"
    ):
        found = search_emails("Mass General Brigham")

    assert found["billing_address"].address == ADDRESS
    assert found["billing_address"].is_remit_to is True


def test_an_address_alone_is_a_usable_answer():
    # No email anywhere, which is the normal case. Finding only an address
    # must still count as finding something.
    with patch.object(contact_search, "_chat", return_value=reply(email=None)), patch.object(
        contact_search, "_fetch_page", return_value=PAGE
    ):
        found = search_emails("Matthew Walker Comprehensive Health Center")

    assert "billing" not in found
    assert found["billing_address"] is not None


def test_no_address_found_is_still_a_correct_answer():
    with patch.object(contact_search, "_chat", return_value=reply(address=None)):
        found = search_emails("A Clinic That Publishes Nothing")

    assert found == {}
