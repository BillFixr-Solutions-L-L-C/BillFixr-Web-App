"""The checks around the fetch that follows a model-supplied URL, and the cache.

The behaviours the search itself is judged on live in test_contact_search.py;
these cover the parts a hostile or unlucky page can reach.
"""

import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import pytest

from engine import contact_search
from engine.contact_search import _CheckedRedirect, _fetch_page, _ip_is_public, _registrable, search_emails


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.delenv("CONTACT_SEARCH_MAX_ATTEMPTS", raising=False)
    contact_search._cache.clear()
    yield
    contact_search._cache.clear()


@pytest.mark.parametrize(
    "host,expected",
    [
        ("www.mwchc.org", "mwchc.org"),
        ("billing.example.com", "example.com"),
        ("www.foo.co.uk", "foo.co.uk"),
        ("foo.co.uk", "foo.co.uk"),
        ("a.b.nhs.uk", "b.nhs.uk"),
    ],
)
def test_registrable_domain_respects_two_label_suffixes(host, expected):
    assert _registrable(host) == expected


def test_two_unrelated_sites_under_one_suffix_are_not_the_same_organisation():
    assert _registrable("foo.co.uk") != _registrable("bar.co.uk")


@pytest.mark.parametrize(
    "ip,public",
    [
        ("8.8.8.8", True),
        ("127.0.0.1", False),
        ("10.1.2.3", False),
        ("169.254.169.254", False),
        ("::1", False),
        ("::ffff:127.0.0.1", False),
        ("0.0.0.0", False),
        ("224.0.0.1", False),
        ("not-an-ip", False),
    ],
)
def test_ip_classification(ip, public):
    assert _ip_is_public(ip) is public


def test_a_redirect_to_an_internal_address_is_refused():
    handler = _CheckedRedirect()
    req = urllib.request.Request("https://mwchc.org/billing")
    with pytest.raises(urllib.error.URLError):
        handler.redirect_request(req, None, 302, "Found", {}, "http://169.254.169.254/latest/meta-data/")


def test_the_connection_itself_refuses_a_loopback_server():
    """Not just the URL pre-check: the connect step re-checks what the name
    resolved to, so a rebinding answer cannot reach a local service."""
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"billing@internal.example")

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with pytest.raises((OSError, urllib.error.URLError)):
            _fetch_page(f"http://127.0.0.1:{server.server_address[1]}/")
    finally:
        server.shutdown()
    assert hits == [], "the request must never reach a loopback server"


def _reply(content="{}"):
    return {"choices": [{"message": {"content": content}}]}


def test_an_outage_is_not_cached_as_no_email():
    calls = []

    def boom(*_a, **_k):
        calls.append(1)
        raise OSError("down")

    with patch.object(contact_search, "_chat", side_effect=boom):
        assert search_emails("Outage Clinic") == {}
    first = len(calls)

    with patch.object(contact_search, "_chat", side_effect=lambda *_a, **_k: (calls.append(1), _reply())[1]):
        search_emails("Outage Clinic")
    assert len(calls) > first, "the second lookup has to actually search again"


def test_an_error_body_on_http_200_is_an_outage_too():
    with patch.object(contact_search, "_chat", return_value={"error": {"message": "rate limited"}}):
        assert search_emails("Limited Clinic") == {}
    assert contact_search._cache == {}


def test_a_completed_search_that_found_nothing_is_remembered_but_only_briefly():
    calls = []
    with patch.object(contact_search, "_chat", side_effect=lambda *_a, **_k: (calls.append(1), _reply())[1]):
        search_emails("Quiet Clinic")
        n = len(calls)
        search_emails("Quiet Clinic")
        assert len(calls) == n

        # Past the short empty-result window it is searched again.
        key = next(iter(contact_search._cache))
        ts, value = contact_search._cache[key]
        contact_search._cache[key] = (ts - contact_search.EMPTY_CACHE_TTL_SECONDS - 1, value)
        search_emails("Quiet Clinic")
        assert len(calls) > n


def test_the_cache_does_not_grow_without_limit(monkeypatch):
    monkeypatch.setattr(contact_search, "CACHE_MAX_ENTRIES", 3)
    with patch.object(contact_search, "_chat", return_value=_reply()):
        for i in range(10):
            search_emails(f"Clinic {i}")
    assert len(contact_search._cache) <= 3
