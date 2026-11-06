"""The federal NPI registry lookup: it must reach any US provider without ever inventing one.

These run against recorded NPPES responses (tests/fixtures/nppes_responses.json),
captured from the live registry and kept verbatim. The recording is keyed by
the exact URL engine/nppes.py builds, and an unrecorded URL fails the test
rather than quietly returning nothing -- otherwise a change in how the
queries are built would show up as "no match" instead of as a broken test.
The fixture was recorded by driving resolve() itself against the live API,
so it holds exactly the calls the code makes.

The names here are strings real users typed into BillFixr ("ascension
rutherford", "Matthew walker hospital nashville"), not tidy hospital names,
because free text is what the field actually receives.
"""

import json
import os
import urllib.parse

import pytest

from engine import nppes
from engine.contact_finder import ProviderContactFinder

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "nppes_responses.json")


def _url(params):
    query = {k: v for k, v in params.items() if v}
    query.update(version="2.1", enumeration_type="NPI-2", limit="200")
    return nppes.API_URL + "?" + urllib.parse.urlencode(query)


@pytest.fixture(autouse=True)
def registry(monkeypatch):
    """Serves the recorded responses in place of the network, and counts the calls."""
    with open(FIXTURES, encoding="utf-8") as fh:
        recorded = json.load(fh)

    monkeypatch.delenv("NPPES_DISABLED", raising=False)
    monkeypatch.setattr(nppes, "_cache", {})
    calls = []

    def fake_request(params):
        url = _url(params)
        calls.append(params.get("organization_name"))
        if url not in recorded:
            raise AssertionError(
                f"no recorded NPPES response for {url}\n"
                "Re-record the fixture if the query shape changed on purpose."
            )
        return recorded[url]

    monkeypatch.setattr(nppes, "_request", fake_request)
    return calls


# --- resolving the free text a customer types -------------------------------

def test_the_typed_phrase_is_the_query(registry):
    """One round trip, because the phrase itself is the most selective prefix.

    Measured on the live registry: "saint thomas rutherford*" returns 3
    records and all 3 are the right facility, where "thomas*" returns 50 and
    "saint thomas*" returns 68.
    """
    best = nppes.resolve("saint thomas rutherford hospital", "Murfreesboro, TN 37129")[0]
    assert best.npi == "1164590386"
    assert registry == ["saint thomas rutherford hospital*"]


def test_a_partial_name_resolves_through_the_dba_index():
    """"ascension rutherford" is not the start of any registered name.

    It is not a prefix of the legal name or of the d/b/a, so the phrase
    queries all miss and the single-token fallback has to carry it: the
    hospital is found under "ascension*" and recognised by the scorer.
    """
    best = nppes.resolve("ascension rutherford", "Murfreesboro, TN 37129")[0]
    assert best.npi == "1164590386"
    assert best.name == "Ascension Saint Thomas Rutherford"
    assert best.mailing_address == "1700 MEDICAL CENTER PKWY, MURFREESBORO, TN 37129-2245"
    assert best.phone == "615-396-4100"
    assert best.facility_type == "General Acute Care Hospital"


def test_st_and_saint_are_the_same_hospital(registry):
    """"st thomas rutherford*" returns nothing from the registry. "saint ..." returns the hospital."""
    best = nppes.resolve("st thomas rutherford", "Murfreesboro, TN 37129")[0]
    assert best.npi == "1164590386"
    assert "st thomas rutherford*" in registry        # tried as typed, and missed
    assert "saint thomas rutherford*" in registry     # then expanded


@pytest.mark.parametrize("code, desc, expected_rank", [
    ("282N00000X", "General Acute Care Hospital", 3),
    ("283Q00000X", "Psychiatric Hospital", 3),
    ("281P00000X", "Chronic Disease Hospital", 3),
    ("261Q00000X", "Clinic/Center", 2),
    ("3104A0630X", "Oxygen Equipment & Supplies", 1),
    ("291U00000X", "Clinical Medical Laboratory", 0),
])
def test_a_hospital_ranks_above_a_clinic_above_a_lab(code, desc, expected_rank):
    """Tested at the mechanism, because downstream it is only ever a tiebreaker.

    The hospital, its clinic and its lab are registered under one name at
    one street, so this ranking is the only thing that can order them -- but
    in the ranked list the hospital also happens to sort first
    alphabetically, which hides whether the ranking is doing anything. An
    earlier version of this file asserted the order and passed with the
    ranking switched off entirely.
    """
    rank, returned_desc = nppes._facility([{"code": code, "desc": desc, "primary": True}])
    assert (rank, returned_desc) == (expected_rank, desc)


def test_the_hospital_outranks_its_own_laboratory():
    """The lab shares the name, the street AND the match score. Only the taxonomy separates them.

    All three records -- hospital, clinic, lab -- are "Saint Thomas
    Rutherford Hospital[ Lab]" at 1700 Medical Center Pkwy, so nothing in
    the name or the address can order them.
    """
    candidates = nppes.resolve("saint thomas rutherford hospital", "Murfreesboro, TN 37129")
    assert candidates[0].facility_type == "General Acute Care Hospital"
    types = [c.facility_type or "" for c in candidates]
    assert any("Laborator" in t for t in types), types
    assert all(i > 0 for i, t in enumerate(types) if "Laborator" in t)


def test_the_town_on_the_bill_picks_between_a_systems_hospitals():
    """One word of a big system's name cannot say which of its hospitals this is.

    "Vanderbilt" alone matches 130 facilities in Tennessee, every one of
    them scoring identically on the name. The town came in with the
    address. Without it this resolved to Vanderbilt Bedford Hospital in
    Nashville, chosen by alphabetical order.
    """
    best = nppes.resolve("vanderbilt", "Clarksville, TN 37040")[0]
    assert best.name == "Vanderbilt Clarksville Hospital"
    assert best.city == "CLARKSVILLE"


def test_the_site_identifies_the_facility_but_the_letter_goes_to_the_billing_office():
    """Vanderbilt's hospitals all mail to one suite in Nashville. That is the billing office."""
    best = nppes.resolve("vanderbilt", "Clarksville, TN 37040")[0]
    assert best.city == "CLARKSVILLE"
    assert "NASHVILLE" in best.mailing_address


def test_a_plain_street_address_beats_one_routed_to_a_department():
    """A billing dispute should not be posted to the radiology department."""
    best = nppes.resolve("Cleveland Clinic", "Cleveland, OH 44195")[0]
    assert best.mailing_address == "9500 EUCLID AVE, CLEVELAND, OH 44195-0001"


def test_a_lowercase_free_text_name_with_a_city_resolves():
    best = nppes.resolve("Matthew walker hospital nashville", "Nashville, TN 37208")[0]
    assert "Matthew Walker" in best.name
    assert best.mailing_address == "1035 14TH AVE N, NASHVILLE, TN 37208-3050"
    assert best.phone == "615-327-9400"


def test_a_hospital_in_another_state_entirely():
    """Nothing about this is Tennessee-specific. It is the whole registry."""
    best = nppes.resolve("Johns Hopkins Hospital", "Baltimore, MD 21287")[0]
    assert best.state == "MD"
    assert best.mailing_address and "BALTIMORE" in best.mailing_address


def test_every_candidate_carries_the_registry_page_that_backs_it():
    for cand in nppes.resolve("ascension rutherford", "Murfreesboro, TN 37129"):
        assert cand.source_url == f"https://npiregistry.cms.hhs.gov/provider-view/{cand.npi}"


def test_duplicate_registrations_at_one_address_collapse():
    candidates = nppes.resolve("vanderbilt", "Clarksville, TN 37040")
    keys = [(c.name.lower(), (c.mailing_address or "").lower()) for c in candidates]
    assert len(keys) == len(set(keys))


# --- and never inventing one -----------------------------------------------

def test_a_name_that_matches_nothing_returns_nothing():
    assert nppes.resolve("Zzqqxxnotahospital Medical Center", "Nashville, TN 37208") == []


def test_a_hopeless_lookup_stops_instead_of_walking_every_prefix(registry):
    """A customer is waiting on this, and every attempt is an HTTP round trip."""
    nppes.resolve("Zzqqxxnotahospital Medical Center", "Nashville, TN 37208")
    assert len(registry) <= nppes.MAX_QUERIES * 2      # once with the state, once without


def test_a_blank_name_never_queries_the_registry(registry):
    assert nppes.resolve("") == []
    assert nppes.resolve("   ", "Nashville, TN") == []
    assert registry == []


def test_a_name_of_nothing_but_generic_words_never_queries(registry):
    """"Medical Center" must not pull back every hospital in the state to be guessed among."""
    assert nppes.resolve("Medical Center", "Nashville, TN 37208") == []
    assert registry == []


def test_a_wrong_state_reports_no_match_rather_than_the_wrong_hospital():
    """Live rows carry a Wyoming virtual address against a Tennessee hospital.

    There is exactly one "Ascension" registered in Wyoming. What must not
    happen is returning it: the customer would get a real, sourced,
    confident address for the wrong organisation. No match sends them to
    manual entry, which is recoverable.

    It also pins the limitation behind this. Widening past the state cannot
    rescue this particular case either -- a national "ascension*" search
    truncates at 200 records before reaching Murfreesboro, and
    "rutherford*" never matches "SAINT THOMAS RUTHERFORD HOSPITAL" because
    Rutherford is not the start of the name. A phrase the customer typed in
    full would have survived a wrong state; two loose words did not.
    """
    assert nppes.resolve("ascension rutherford", "30 N Gould St ste n, Sheridan, WY 82801, USA") == []


def test_the_full_name_survives_a_wrong_state():
    """The same bogus Wyoming address, but the customer typed the hospital's name in full."""
    best = nppes.resolve(
        "ascension saint thomas rutherford", "30 N Gould St ste n, Sheridan, WY 82801, USA"
    )[0]
    assert (best.npi, best.state) == ("1164590386", "TN")


def test_a_registry_outage_leaves_the_customer_on_manual_entry(monkeypatch):
    import urllib.error

    monkeypatch.setattr(nppes, "_request", lambda _p: (_ for _ in ()).throw(urllib.error.URLError("refused")))
    assert nppes.resolve("ascension rutherford", "Murfreesboro, TN") == []


def test_a_timeout_is_not_an_exception_the_caller_sees(monkeypatch):
    monkeypatch.setattr(nppes, "_request", lambda _p: (_ for _ in ()).throw(TimeoutError("timed out")))
    assert nppes.resolve("ascension rutherford", "Murfreesboro, TN") == []


# --- reading the state off whatever the customer typed ----------------------

@pytest.mark.parametrize("address, expected", [
    ("1700 Medical Center Pkwy, Murfreesboro, TN 37129", "TN"),
    ("Nashville, TN", "TN"),
    ("30 N Gould St ste n, Sheridan, WY 82801, USA", "WY"),
    ("34 The Heights", None),
    ("", None),
    (None, None),
])
def test_the_state_is_only_read_when_it_is_plainly_there(address, expected):
    assert nppes._state_from(address) == expected


# --- what the finder does with it ------------------------------------------

def test_an_uncurated_hospital_now_gets_a_postal_address():
    """The point of all of this: a hospital nobody typed into our directory."""
    contact = ProviderContactFinder().find_contact(
        "Matthew walker hospital nashville", "Nashville, TN 37208"
    )
    assert contact.mailing_address == "1035 14TH AVE N, NASHVILLE, TN 37208-3050"
    assert contact.phone == "615-327-9400"
    assert contact.npi
    assert contact.verification_status == "listed"
    assert contact.sources and all(u.startswith("https://") for u in contact.sources)


def test_a_registry_answer_never_carries_an_email():
    """NPPES has no email field. A send must still refuse rather than guess one."""
    contact = ProviderContactFinder().find_contact(
        "Matthew walker hospital nashville", "Nashville, TN 37208"
    )
    assert contact.billing_email is None
    assert contact.support_email is None
    assert "no email" in contact.notes.lower()


def test_the_notes_say_another_facility_matched_the_same_name():
    contact = ProviderContactFinder().find_contact(
        "saint thomas rutherford hospital", "Murfreesboro, TN 37129"
    )
    assert len(contact.candidates) > 1
    assert "other facility match this name" in contact.notes


def test_an_unmatched_name_still_says_it_does_not_guess():
    contact = ProviderContactFinder().find_contact(
        "Zzqqxxnotahospital Medical Center", "Nashville, TN 37208"
    )
    assert (contact.billing_email, contact.phone, contact.mailing_address) == (None, None, None)
    assert "does not guess" in contact.notes
