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
