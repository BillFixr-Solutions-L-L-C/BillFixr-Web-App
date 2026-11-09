"""The web search for a billing email, and the checks that stop it being believed.

The point of this module is not that it can find an address. It is that it
refuses the ones it cannot stand behind, because the cost of being wrong is
posting someone's medical bill to a stranger. So most of these tests are
about rejection, and each one names the way a model actually gets this
wrong.

Nothing here touches the network: the OpenRouter call and the verification
fetch are both stubbed, and fetching a page nobody stubbed is an assertion
failure rather than a quiet miss.
"""

import pytest

from engine import contact_search


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(contact_search, "_cache", {})

    # DNS stays offline too. Anything named "internal" resolves to loopback
    # so the SSRF guard can be tested; everything else looks public.
    def fake_getaddrinfo(host, _port):
        if "internal" in host:
            return [(2, 1, 6, "", ("127.0.0.1", 0))]
        return [(2, 1, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(contact_search.socket, "getaddrinfo", fake_getaddrinfo)


def install(monkeypatch, reply, pages, calls=None):
    def fake_chat(payload, _api_key):
        if calls is not None:
            calls.append(payload)
        return {"choices": [{"message": {"content": reply}}]}

    def fake_page(url):
        if url not in pages:
            raise AssertionError(f"fetched a page no test stubbed: {url}")
        page = pages[url]
        if isinstance(page, Exception):
            raise page
        return page

    monkeypatch.setattr(contact_search, "_chat", fake_chat)
    monkeypatch.setattr(contact_search, "_fetch_page", fake_page)


REPLY = """{"billing": {"email": "billing@mwchc.org", "source_url": "https://mwchc.org/billing"},
            "support": null}"""
PAGE = "<html>Patient accounts: billing@mwchc.org or call 615-984-4290</html>"


def test_an_address_published_on_the_provider_s_own_page_is_accepted(monkeypatch):
    install(monkeypatch, REPLY, {"https://mwchc.org/billing": PAGE})

    found = contact_search.search_emails("Matthew Walker Comprehensive Health Center", "Smyrna, TN")

    assert found["billing"].email == "billing@mwchc.org"
    assert found["billing"].source_url == "https://mwchc.org/billing"
    assert found["billing"].page_domain == "mwchc.org"
    assert "support" not in found


def test_an_address_that_is_not_on_the_page_it_cites_is_dropped(monkeypatch):
    """The failure this whole module exists to catch.

    A model asked for a billing email will produce `billing@<hospital>` and
    cite the hospital's real contact page, because that is what such a page
    usually contains. Here it does not, so the answer goes in the bin.
    """
    install(monkeypatch, REPLY, {"https://mwchc.org/billing": "<html>Call us on 615-984-4290</html>"})

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_an_address_published_on_somebody_else_s_site_is_dropped(monkeypatch):
    # The string is on the page, but the page is not the domain the address
    # belongs to -- a directory site, a scraper, a forum post. That is not
    # the hospital telling us where to write.
    reply = """{"billing": {"email": "billing@mwchc.org",
                            "source_url": "https://hospital-directory.example/tn/mwchc"}}"""
    install(monkeypatch, reply, {"https://hospital-directory.example/tn/mwchc": PAGE})

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_a_url_pointing_inside_the_network_is_never_fetched(monkeypatch):
    # The URL comes from a model and this process then fetches it. A host
    # resolving to loopback has to be refused BEFORE the fetch.
    #
    # Recording the attempt rather than raising on it, deliberately: _verify
    # catches every exception from the fetch, so a stub that raised would be
    # swallowed and this test would pass with the guard deleted. It did,
    # until a mutation run caught it.
    fetched = []
    reply = """{"billing": {"email": "billing@internal.example", "source_url": "http://internal.example/"}}"""

    def fake_page(url):
        fetched.append(url)
        return "billing@internal.example"

    monkeypatch.setattr(
        contact_search, "_chat", lambda *_a, **_k: {"choices": [{"message": {"content": reply}}]}
    )
    monkeypatch.setattr(contact_search, "_fetch_page", fake_page)

    assert contact_search.search_emails("Anywhere General", None) == {}
    assert fetched == [], "a loopback address must be refused before anything fetches it"


def test_a_page_that_cannot_be_fetched_is_not_taken_on_trust(monkeypatch):
    install(monkeypatch, REPLY, {"https://mwchc.org/billing": OSError("connection reset")})

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_both_addresses_come_back_from_one_search(monkeypatch):
    # Two buttons on the form, one search: the second press must not cost
    # another one.
    reply = """{"billing": {"email": "billing@mwchc.org", "source_url": "https://mwchc.org/billing"},
                "support": {"email": "help@mwchc.org", "source_url": "https://mwchc.org/contact"}}"""
    calls = []
    install(
        monkeypatch,
        reply,
        {
            "https://mwchc.org/billing": PAGE,
            "https://mwchc.org/contact": "<html>help@mwchc.org</html>",
        },
        calls,
    )

    found = contact_search.search_emails("Matthew Walker", "Smyrna, TN")

    assert found["billing"].email == "billing@mwchc.org"
    assert found["support"].email == "help@mwchc.org"
    assert len(calls) == 1


def test_the_same_question_is_not_searched_twice(monkeypatch):
    calls = []
    install(monkeypatch, REPLY, {"https://mwchc.org/billing": PAGE}, calls)

    first = contact_search.search_emails("Matthew Walker", "Smyrna, TN")
    second = contact_search.search_emails("  matthew walker ", "smyrna, tn")

    assert first == second
    assert len(calls) == 1, "a repeated lookup must not pay for another search"


def test_the_address_is_part_of_the_question(monkeypatch):
    # Without it the search goes back to picking a campus at random, which
    # is how a Smyrna bill got the Nashville number.
    calls = []
    install(monkeypatch, REPLY, {"https://mwchc.org/billing": PAGE}, calls)

    contact_search.search_emails("Matthew Walker", "739 President Pl, Smyrna, TN 37167")

    asked = calls[0]["messages"][-1]["content"]
    assert "739 President Pl, Smyrna, TN 37167" in asked
    assert calls[0]["tools"][0]["type"] == "openrouter:web_search"


@pytest.mark.parametrize(
    "reply",
    [
        '```json\n{"billing": {"email": "billing@mwchc.org", "source_url": "https://mwchc.org/billing"}}\n```',
        'Here is what I found:\n{"billing": {"email": "billing@mwchc.org", "source_url": "https://mwchc.org/billing"}}',
    ],
    ids=["fenced", "prose around it"],
)
def test_json_is_read_out_of_a_reply_that_is_not_only_json(monkeypatch, reply):
    install(monkeypatch, reply, {"https://mwchc.org/billing": PAGE})

    found = contact_search.search_emails("Matthew Walker", "Smyrna, TN")

    assert found["billing"].email == "billing@mwchc.org"


@pytest.mark.parametrize(
    "reply",
    [
        "I could not find a billing email for this provider.",
        '{"billing": null, "support": null}',
        '{"billing": {"email": "not an address", "source_url": "https://mwchc.org/billing"}}',
        '{"billing": {"email": "billing@mwchc.org"}}',
        "",
    ],
    ids=["prose refusal", "explicit nulls", "not an email", "no source url", "empty"],
)
def test_an_answer_with_nothing_usable_in_it_is_empty(monkeypatch, reply):
    install(monkeypatch, reply, {"https://mwchc.org/billing": PAGE})

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_a_failed_search_degrades_to_no_email(monkeypatch):
    # No email is a normal answer here, so an OpenRouter outage must not
    # turn the lookup into an error the customer sees.
    def boom(_payload, _key):
        raise OSError("openrouter unreachable")

    monkeypatch.setattr(contact_search, "_chat", boom)

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_it_does_nothing_without_a_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")

    def never(_payload, _key):
        raise AssertionError("must not call OpenRouter without a key")

    monkeypatch.setattr(contact_search, "_chat", never)

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}


def test_it_does_nothing_when_switched_off(monkeypatch):
    monkeypatch.setenv("CONTACT_SEARCH_DISABLED", "1")

    def never(_payload, _key):
        raise AssertionError("must not search when disabled")

    monkeypatch.setattr(contact_search, "_chat", never)

    assert contact_search.search_emails("Matthew Walker", "Smyrna, TN") == {}
    assert contact_search.probe() == {"reachable": False, "disabled": True}


def test_the_probe_reports_a_missing_key_rather_than_raising(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    assert contact_search.probe()["reachable"] is False


def test_the_probe_asks_the_way_a_real_lookup_asks(monkeypatch):
    """A green probe has to mean the search works, not just that chat works.

    The first version of this sent a bare "ping" with no tools. That passes
    on a key with no access to the web search tool, which is the one thing
    the probe is for: without it, every hospital comes back as publishing no
    email and nothing anywhere says why.
    """
    asked = []

    def fake_chat(payload, _key):
        asked.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(contact_search, "_chat", fake_chat)

    result = contact_search.probe()

    assert result["reachable"] is True
    assert result["web_search"] is True
    assert asked[0]["tools"][0]["type"] == "openrouter:web_search"


def test_a_tool_openrouter_refuses_is_a_failed_probe(monkeypatch):
    # OpenRouter returns 200 with the refusal in the body, so urllib raises
    # nothing and the request looks like a success.
    monkeypatch.setattr(
        contact_search,
        "_chat",
        lambda *_a, **_k: {"error": {"message": "No endpoints found that support tool use"}},
    )

    result = contact_search.probe()

    assert result["reachable"] is False
    assert "tool use" in result["error"]


def test_a_bare_error_string_in_the_body_is_reported_too(monkeypatch):
    # Not every OpenRouter error body wraps the message in an object.
    monkeypatch.setattr(contact_search, "_chat", lambda *_a, **_k: {"error": "rate limited"})

    result = contact_search.probe()

    assert result["reachable"] is False
    assert result["error"] == "rate limited"
