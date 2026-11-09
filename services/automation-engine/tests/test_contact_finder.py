"""The provider contact lookup: it must match carefully and never guess."""

import json
import re

import pytest
from fastapi.testclient import TestClient

import server
from engine.contact_finder import DIRECTORY_PATH, ProviderContactFinder

finder = ProviderContactFinder()
client = TestClient(server.app)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def test_known_hospital_returns_its_sourced_contacts():
    contact = finder.find_contact("Cedars-Sinai Medical Center", "8700 Beverly Blvd, Los Angeles, CA 90048")
    assert contact.provider_name == "Cedars-Sinai Medical Center"
    assert contact.billing_email == "patient.billing@cshs.org"
    assert contact.phone == "866-803-1777"
    assert contact.sources and all(url.startswith("https://") for url in contact.sources)


def test_hospital_without_a_published_email_returns_no_email_and_says_so():
    contact = finder.find_contact("Mayo Clinic", "200 First St SW, Rochester, MN")
    assert contact.billing_email is None
    assert contact.phone == "844-217-9591"
    assert "no billing email" in contact.notes.lower()


def test_unknown_hospital_is_never_guessed():
    contact = finder.find_contact("Example Community Health Center", "1 Main St, Springfield, IL")
    assert (contact.billing_email, contact.support_email, contact.phone) == (None, None, None)
    assert contact.verification_status == "unverified"
    assert "does not guess" in contact.notes


def test_blank_name_returns_nothing():
    assert finder.find_contact("   ").billing_email is None


@pytest.mark.parametrize("name, address", [
    ("Mayo Regional Hospital", "897 W Main St, Dover-Foxcroft, ME"),       # shares the word "Mayo", not Mayo Clinic
    ("Mount Sinai Hospital", "1500 S California Ave, Chicago, IL"),        # a different Mount Sinai, in another state
    ("Duke of Edinburgh Medical Center", "10 High St, Edinburgh"),
])
def test_similar_names_do_not_match(name, address):
    assert finder.find_contact(name, address).provider_name is None


def test_the_same_name_in_the_right_state_matches():
    assert finder.find_contact("Mount Sinai Hospital", "1468 Madison Ave, New York, NY").provider_name == "Mount Sinai Health System"


def test_without_an_address_the_match_asks_to_confirm_the_location():
    contact = finder.find_contact("Mount Sinai Hospital")
    assert contact.provider_name == "Mount Sinai Health System"
    assert "confirm this is the right location" in contact.notes


def test_a_renamed_hospital_finds_its_new_owner():
    assert finder.find_contact("North Valley Hospital", "Whitefish, MT").billing_email == "patientaccounting@logan.org"


def test_endpoint_returns_the_same_lookup():
    resp = client.post("/api/providers/contact", json={"provider_name": "Logan Health", "address": "Kalispell, MT"})
    assert resp.status_code == 200
    assert resp.json()["billing_email"] == "patientaccounting@logan.org"


def test_directory_entries_are_well_formed():
    data = json.load(open(DIRECTORY_PATH, encoding="utf-8"))
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["checked_on"])
    for entry in data["providers"]:
        assert entry["name"] and entry["keywords"], entry["name"]
        assert entry["verification_status"] in ("verified", "listed"), entry["name"]
        assert entry["sources"] and all(url.startswith("https://") for url in entry["sources"]), entry["name"]
        assert entry["billing_url"].startswith("https://"), entry["name"]
        for field in ("billing_email", "support_email"):
            assert entry[field] is None or EMAIL.match(entry[field]), (entry["name"], field)
        # A match needs a whole-phrase keyword, so a single common word would match unrelated hospitals.
        assert all(len(k.split()) >= 2 or k in ("sutter", "icahn") for k in entry["keywords"]) or entry["states"], entry["name"]


# --- the web search for an email, seen from the lookup that uses it -------
#
# contact_search has its own tests for the checks it runs. These are about
# the wiring: that a hospital nobody curated can still come back with an
# email, and that a curated field is never replaced by a searched one.

def _searching(monkeypatch, found):
    """Make the email search return `found` without going near the network."""
    from engine import contact_search

    monkeypatch.setattr(contact_search, "search_emails", lambda *_a, **_k: found)


def _found(email, url, domain):
    from engine.contact_search import EmailFind

    return EmailFind(email=email, source_url=url, page_domain=domain)


def test_a_hospital_nobody_curated_can_still_come_back_with_an_email(monkeypatch):
    # The registry has no email field for anyone, so before the search this
    # was the end of the road for every hospital outside the directory --
    # which is nearly all of them.
    monkeypatch.setattr(
        "engine.nppes.resolve",
        lambda *_a, **_k: [],
    )
    _searching(monkeypatch, {"billing": _found("billing@mwchc.org", "https://mwchc.org/billing", "mwchc.org")})

    res = ProviderContactFinder().find_contact("Matthew Walker Comprehensive Health Center", "Smyrna, TN")

    assert res.billing_email == "billing@mwchc.org"
    assert res.email_source_url == "https://mwchc.org/billing"
    assert "mwchc.org" in res.notes
    assert res.verification_status == "listed"


def test_a_curated_email_wins_over_a_searched_one(monkeypatch, tmp_path):
    """Precedence, tested where it can actually be observed.

    The test below only proves the search is skipped when the directory has
    both addresses -- with nothing searched, which address wins is not
    exercised at all. So this one uses an entry that has a billing email and
    no support email: the search runs, returns a different billing address,
    and the hand-traced one must still be the one that comes back. A
    mutation run found this gap by flipping the precedence and watching
    every test pass.
    """
    directory = tmp_path / "directory.json"
    directory.write_text(
        json.dumps(
            {
                "providers": [
                    {
                        "name": "Curated General",
                        "keywords": ["curated general"],
                        "billing_email": "traced-by-hand@curated.example",
                        "sources": ["https://curated.example/billing"],
                        "verification_status": "verified",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("engine.nppes.resolve", lambda *_a, **_k: [])
    _searching(
        monkeypatch,
        {
            "billing": _found("searched@curated.example", "https://curated.example/x", "curated.example"),
            "support": _found("help@curated.example", "https://curated.example/y", "curated.example"),
        },
    )

    res = ProviderContactFinder(str(directory)).find_contact("Curated General", None)

    assert res.billing_email == "traced-by-hand@curated.example"
    # The gap the entry does leave is filled by the search.
    assert res.support_email == "help@curated.example"


def test_the_search_does_not_run_when_the_directory_has_both(monkeypatch):
    # A curated field was traced to the hospital's own page by hand. A
    # searched one was checked by a machine. When both exist the hand-traced
    # one wins, and the search should not even run.
    def never(*_a, **_k):
        raise AssertionError("must not search when the directory already has both emails")

    from engine import contact_search

    monkeypatch.setattr(contact_search, "search_emails", never)
    entry = next(p for p in json.load(open(DIRECTORY_PATH, encoding="utf-8"))["providers"]
                 if p.get("billing_email") and p.get("support_email"))

    res = ProviderContactFinder().find_contact(entry["keywords"][0], None)

    assert res.billing_email == entry["billing_email"]


def test_nothing_anywhere_still_refuses_to_guess(monkeypatch):
    monkeypatch.setattr("engine.nppes.resolve", lambda *_a, **_k: [])
    _searching(monkeypatch, {})

    res = ProviderContactFinder().find_contact("Zzqqxx Notahospital Medical Center", "Nashville, TN")

    assert res.billing_email is None
    assert res.support_email is None
    assert "does not guess" in res.notes
