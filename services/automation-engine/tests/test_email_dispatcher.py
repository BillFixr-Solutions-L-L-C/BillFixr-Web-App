"""The Resend transport.

Letters used to go out over SMTP, which reports nothing back, so once a
letter left the engine nobody could say whether it arrived. Resend reports
delivery, bounces and opens to the web app's webhook — these tests cover
the parts that have to be right for that to work: the tag the web app
matches on, the threading headers, and the Message-ID, which Resend assigns
itself and which the inbound poller depends on.
"""

import os
import pytest

from engine.email_dispatcher import EmailDispatcher, case_tags


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


class FakeClient:
    """Stands in for httpx.Client, recording what the dispatcher sent."""

    def __init__(self, posts, gets, log):
        self._posts, self._gets, self._log = posts, gets, log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def post(self, url, headers=None, json=None):
        self._log.append(("POST", url, headers, json))
        return self._posts.pop(0)

    def get(self, url, headers=None):
        self._log.append(("GET", url, headers, None))
        return self._gets.pop(0)


@pytest.fixture
def dispatcher(monkeypatch):
    # conftest sets TESTING=1 for the whole suite, which disables every live
    # transport. These tests are about the live path, so it is lifted here
    # and only here.
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("SMTP_FROM", "advocate@billfixr.com")
    return EmailDispatcher()


def install_http(monkeypatch, posts, gets):
    log = []
    monkeypatch.setattr(
        "engine.email_dispatcher.httpx.Client",
        lambda *a, **k: FakeClient(posts, gets, log),
    )
    return log


def dispatch(dispatcher, **overrides):
    # pytest re-sets PYTEST_CURRENT_TEST for the call phase, after fixtures
    # have run, so the live-send guard has to be lifted here rather than in
    # the fixture. test_no_live_send_in_a_test_environment covers the guard
    # itself.
    os.environ.pop("PYTEST_CURRENT_TEST", None)
    os.environ.pop("TESTING", None)
    kwargs = dict(
        recipient_email="billing@hospital.example",
        support_email="advocacy@hospital.example",
        subject="Formal Billing Dispute [BFX-1]",
        letter_markdown="# Dispute\n\nPlease review.",
        tracking_code="BFX-1",
        sender_email="advocate@billfixr.com",
    )
    kwargs.update(overrides)
    return dispatcher.dispatch_dispute_packet(**kwargs)


def test_sends_through_resend_and_reports_both_ids(dispatcher, monkeypatch):
    log = install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(200, {"message_id": "<real@resend>"})],
    )

    receipt = dispatch(dispatcher, tags={"case_ref": "case-1"})

    assert receipt["mode"] == "LIVE_RESEND"
    # The id Resend's webhook quotes as email_id.
    assert receipt["provider_message_id"] == "email-123"
    # The Message-ID the hospital will see, which is NOT the one the
    # dispatcher generated.
    assert receipt["message_id"] == "<real@resend>"
    assert log[0][0] == "POST"
    assert log[1][1].endswith("/emails/email-123")


def test_payload_carries_recipients_tags_and_threading(dispatcher, monkeypatch):
    log = install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(200, {"message_id": "<real@resend>"})],
    )

    dispatch(
        dispatcher,
        in_reply_to="<prev@resend>",
        references="<root@resend> <prev@resend>",
        tags={"case_ref": "11111111-1111-1111-1111-111111111111"},
    )

    _, url, headers, payload = log[0]
    assert url.endswith("/emails")
    assert headers["Authorization"] == "Bearer re_test_key"
    assert payload["to"] == ["billing@hospital.example"]
    assert payload["cc"] == ["advocacy@hospital.example"]
    assert payload["headers"]["In-Reply-To"] == "<prev@resend>"
    assert payload["headers"]["References"] == "<root@resend> <prev@resend>"
    # Resend assigns the Message-ID and ignores any we send, so sending one
    # would only create the illusion that we chose it.
    assert "Message-ID" not in payload["headers"]
    assert payload["tags"] == [{"name": "case_ref", "value": "11111111-1111-1111-1111-111111111111"}]
    # Both renderings, as the SMTP path sent.
    assert payload["html"] and payload["text"]


def test_does_not_cc_the_support_address_when_it_is_the_billing_address(dispatcher, monkeypatch):
    log = install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(200, {"message_id": "<real@resend>"})],
    )

    dispatch(dispatcher, support_email="billing@hospital.example")

    assert "cc" not in log[0][3]


def test_message_id_is_none_rather_than_wrong_when_resend_never_reports_it(dispatcher, monkeypatch):
    # A wrong Message-ID is worse than none: it would be sent as the
    # In-Reply-To of the next letter and break the thread at the hospital.
    install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(404), FakeResponse(404), FakeResponse(404)],
    )
    monkeypatch.setattr("engine.email_dispatcher.time.sleep", lambda _s: None)

    receipt = dispatch(dispatcher)

    assert receipt["provider_message_id"] == "email-123"
    assert receipt["message_id"] is None


def test_retries_reading_the_message_id_before_giving_up(dispatcher, monkeypatch):
    install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(200, {}), FakeResponse(200, {"message_id": "<late@resend>"})],
    )
    monkeypatch.setattr("engine.email_dispatcher.time.sleep", lambda _s: None)

    assert dispatch(dispatcher)["message_id"] == "<late@resend>"


def test_a_rejected_send_does_not_claim_to_have_sent(dispatcher, monkeypatch):
    install_http(monkeypatch, posts=[FakeResponse(422, {}, "invalid from address")], gets=[])

    receipt = dispatch(dispatcher)

    assert receipt["mode"] != "LIVE_RESEND"
    assert "invalid from address" in receipt["resend_error"]
    assert receipt["provider_message_id"] is None


def test_an_accepted_send_with_no_id_is_treated_as_a_failure(dispatcher, monkeypatch):
    # Without an id there is nothing for the webhook to match, so claiming
    # success would record a letter nobody can track.
    install_http(monkeypatch, posts=[FakeResponse(200, {})], gets=[])

    receipt = dispatch(dispatcher)

    assert receipt["mode"] != "LIVE_RESEND"
    assert "no id" in receipt["resend_error"]


def test_resend_is_preferred_over_smtp(dispatcher, monkeypatch):
    monkeypatch.setenv("SMTP_USER", "advocate@billfixr.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    install_http(
        monkeypatch,
        posts=[FakeResponse(200, {"id": "email-123"})],
        gets=[FakeResponse(200, {"message_id": "<real@resend>"})],
    )

    def explode(*a, **k):
        raise AssertionError("SMTP was used while Resend was configured")

    monkeypatch.setattr("engine.email_dispatcher.smtplib.SMTP", explode)
    monkeypatch.setattr("engine.email_dispatcher.smtplib.SMTP_SSL", explode)

    assert dispatch(dispatcher)["mode"] == "LIVE_RESEND"


def test_no_live_send_in_a_test_environment(monkeypatch):
    # PYTEST_CURRENT_TEST is cleared so TESTING is the only thing stopping
    # the send — otherwise this would pass with the TESTING check deleted.
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("TESTING", "1")
    assert EmailDispatcher().is_live_resend_configured() is False


def test_no_live_send_under_pytest_even_outside_a_testing_env(monkeypatch):
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_x.py::test_y (call)")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    assert EmailDispatcher().is_live_resend_configured() is False


def test_no_live_send_without_a_key(monkeypatch):
    # Both guards lifted, so the missing key is what decides.
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "")
    assert EmailDispatcher().is_live_resend_configured() is False


def test_a_configured_key_outside_a_test_environment_does_send(monkeypatch):
    # The positive case, so the three above cannot all pass by the method
    # simply always returning False.
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_live_key")
    assert EmailDispatcher().is_live_resend_configured() is True


class TestCaseTags:
    def test_builds_the_tag_the_webhook_matches_on(self):
        assert case_tags("case-1") == {"case_ref": "case-1"}

    def test_no_tag_at_all_when_there_is_no_reference(self):
        # An untagged letter is untracked. That is better than a tag the
        # web app would try to resolve to a case and fail.
        assert case_tags("") is None
        assert case_tags(None) is None
        assert case_tags("   ") is None
