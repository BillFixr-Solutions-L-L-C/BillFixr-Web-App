"""The registry reachability probe on /api/health.

This exists for one reason: the rest of the suite runs against recorded
NPPES responses, so it cannot tell a reachable registry from a blocked
one. In production that difference is the whole feature -- blocked egress
means every hospital outside the curated directory reports "no contact
found", with nothing anywhere saying why.

So the probe itself is tested here with the network stubbed, and the live
check is a request someone makes against the deployment.
"""

import pytest
from fastapi.testclient import TestClient

import server
from engine import nppes

client = TestClient(server.app)


def test_the_default_health_check_does_not_call_the_registry(monkeypatch):
    """Render polls this route. It must not depend on a third party being up."""
    def fail(_params):
        raise AssertionError("the default health check must not reach the registry")

    monkeypatch.setattr(nppes, "_request", fail)
    body = client.get("/api/health").json()

    assert body["status"] == "healthy"
    assert "provider_registry" not in body


def test_asking_for_the_registry_check_reports_it_reachable(monkeypatch):
    monkeypatch.delenv("NPPES_DISABLED", raising=False)
    monkeypatch.setattr(nppes, "_cache", {})
    monkeypatch.setattr(nppes, "_request", lambda _p: {"results": [{"number": "1"}, {"number": "2"}]})

    registry = client.get("/api/health?check=registry").json()["provider_registry"]

    assert registry["reachable"] is True
    assert registry["disabled"] is False
    assert registry["results"] == 2
    assert isinstance(registry["elapsed_ms"], int)


def test_blocked_egress_is_reported_not_raised(monkeypatch):
    """The failure this whole endpoint exists to catch."""
    import urllib.error

    monkeypatch.delenv("NPPES_DISABLED", raising=False)
    monkeypatch.setattr(nppes, "_cache", {})

    def blocked(_params):
        raise urllib.error.URLError("Network is unreachable")

    monkeypatch.setattr(nppes, "_request", blocked)

    response = client.get("/api/health?check=registry")
    registry = response.json()["provider_registry"]

    # Still a 200: the engine is healthy, one of its sources is not.
    assert response.status_code == 200
    assert registry["reachable"] is False
    assert registry["error"] == "URLError"


def test_the_probe_says_so_when_the_registry_is_switched_off(monkeypatch):
    monkeypatch.setenv("NPPES_DISABLED", "1")
    assert nppes.probe() == {"reachable": False, "disabled": True}


@pytest.mark.parametrize("value", ["", "store", "registryx"])
def test_only_an_exact_request_triggers_the_network_call(value, monkeypatch):
    """A near-miss must not quietly skip the check and look like a pass."""
    monkeypatch.setattr(nppes, "_request", lambda _p: pytest.fail("should not be called"))
    assert "provider_registry" not in client.get(f"/api/health?check={value}").json()


# --- the email search half of a contact lookup ----------------------------

def test_the_default_health_check_does_not_call_openrouter(monkeypatch):
    from engine import contact_search

    def fail(*_a, **_k):
        raise AssertionError("the default health check must not call OpenRouter")

    monkeypatch.setattr(contact_search, "_chat", fail)
    assert "contact_search" not in client.get("/api/health").json()


def test_asking_for_the_contact_search_check_reports_it_reachable(monkeypatch):
    from engine import contact_search

    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(contact_search, "_chat", lambda *_a, **_k: {"choices": []})

    probe = client.get("/api/health?check=contact-search").json()["contact_search"]

    assert probe["reachable"] is True
    assert probe["model"]
    assert isinstance(probe["elapsed_ms"], int)


def test_a_blocked_or_unkeyed_openrouter_is_reported_not_raised(monkeypatch):
    """The failure this probe exists for: it looks exactly like 'no email published'."""
    from engine import contact_search

    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def blocked(*_a, **_k):
        raise OSError("Network is unreachable")

    monkeypatch.setattr(contact_search, "_chat", blocked)

    response = client.get("/api/health?check=contact-search")

    assert response.status_code == 200
    assert response.json()["contact_search"]["reachable"] is False


def test_both_checks_can_be_asked_for_at_once(monkeypatch):
    from engine import contact_search, nppes

    monkeypatch.delenv("NPPES_DISABLED", raising=False)
    monkeypatch.delenv("CONTACT_SEARCH_DISABLED", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(nppes, "_cache", {})
    monkeypatch.setattr(nppes, "_request", lambda _p: {"results": []})
    monkeypatch.setattr(contact_search, "_chat", lambda *_a, **_k: {"choices": []})

    body = client.get("/api/health?check=registry,contact-search").json()

    assert body["provider_registry"]["reachable"] is True
    assert body["contact_search"]["reachable"] is True
