"""The configuration check.

Each case here is a real way this service can be deployed wrong while
appearing to work, which is why the check exists at all.
"""

import pytest

from engine import readiness


GOOD = {
    "ENGINE_API_KEY": "engine-key",
    "OPENROUTER_API_KEY": "or-key",
    "RESEND_API_KEY": "re-key",
    "ADVOCATE_EMAIL": "advocate@billfixr.com",
    "SMTP_USER": "advocate@billfixr.com",
    "SMTP_PASSWORD": "mailbox-password",
    "ENGINE_DATABASE_URL": "postgresql://engine:db-password@db.example.com:5432/postgres",
}


def without(*names):
    return {k: v for k, v in GOOD.items() if k not in names}


def settings_of(result):
    return {p["setting"] for p in result["problems"]}


def criticals(result):
    return {p["setting"] for p in result["problems"] if p["severity"] == "critical"}


def test_a_fully_configured_engine_is_ready():
    result = readiness.check(GOOD)
    assert result["ready"] is True
    assert result["problems"] == []
    assert result["letters_tracked"] and result["replies_read"] and result["api_protected"]
    assert result["store_durable"] is True


def test_a_store_that_dies_with_the_container_is_a_warning():
    """The engine still runs and still sends; what it loses is the record
    that it sent. A reply to a letter whose negotiation is gone is parsed,
    matched against nothing and discarded, so this has to be visible
    somewhere before a letter goes out rather than after one is ignored."""
    result = readiness.check(without("ENGINE_DATABASE_URL"))
    assert result["store_durable"] is False
    assert "ENGINE_DATABASE_URL" in settings_of(result)
    assert "ENGINE_DATABASE_URL" not in criticals(result)
    # Still ready: a laptop with no Postgres is a legitimate way to run this.
    assert result["ready"] is True


def test_the_banner_says_whether_the_store_survives_a_restart():
    assert "store survives restart   : yes (Postgres)" in readiness.format_report(readiness.check(GOOD))
    text = readiness.format_report(readiness.check(without("ENGINE_DATABASE_URL")))
    assert "store survives restart   : NO (SQLite on local disk)" in text


def test_an_open_api_is_critical():
    result = readiness.check(without("ENGINE_API_KEY"))
    assert result["ready"] is False
    assert "ENGINE_API_KEY" in criticals(result)
    assert result["api_protected"] is False


def test_a_sender_on_the_wrong_domain_is_critical():
    # The failure this check exists for: Resend rejects the send, the
    # engine falls back to SMTP, and every letter goes out untracked while
    # nothing anywhere reports an error.
    result = readiness.check({**GOOD, "ADVOCATE_EMAIL": "billfixr.advocate@gmail.com"})
    assert result["ready"] is False
    assert "ADVOCATE_EMAIL" in criticals(result)
    assert "untracked" in next(p["effect"] for p in result["problems"] if p["setting"] == "ADVOCATE_EMAIL")


def test_a_lookalike_domain_does_not_pass():
    # endswith on the bare domain would accept this.
    result = readiness.check({**GOOD, "ADVOCATE_EMAIL": "advocate@notbillfixr.com"})
    assert "ADVOCATE_EMAIL" in criticals(result)


def test_a_subdomain_sender_does_not_pass():
    result = readiness.check({**GOOD, "ADVOCATE_EMAIL": "advocate@mail.billfixr.com"})
    assert "ADVOCATE_EMAIL" in criticals(result)


def test_the_sender_domain_is_matched_regardless_of_case():
    result = readiness.check({**GOOD, "ADVOCATE_EMAIL": "Advocate@BillFixr.com"})
    assert result["ready"] is True


def test_smtp_from_stands_in_for_advocate_email():
    # config.py falls back to SMTP_FROM, so the check has to as well or it
    # would condemn a correctly configured engine.
    result = readiness.check({**without("ADVOCATE_EMAIL"), "SMTP_FROM": "advocate@billfixr.com"})
    assert result["ready"] is True


def test_the_sender_domain_is_not_checked_when_resend_is_not_in_use():
    # On the SMTP path any address is legitimate; it is only Resend that
    # demands a verified domain. Flagging it here would be noise.
    env = {**without("RESEND_API_KEY"), "ADVOCATE_EMAIL": "advocate@gmail.com"}
    result = readiness.check(env)
    assert "ADVOCATE_EMAIL" not in settings_of(result)
    # Still warned about, because untracked letters are the whole problem.
    assert "RESEND_API_KEY" in settings_of(result)
    assert result["letters_tracked"] is False


def test_untracked_letters_warn_but_do_not_stop_the_engine():
    # Sending untracked is bad. Not sending at all is worse.
    result = readiness.check(without("RESEND_API_KEY"))
    assert result["ready"] is True


def test_a_missing_mailbox_is_reported_with_the_name_that_trips_people_up():
    result = readiness.check(without("SMTP_USER", "SMTP_PASSWORD"))
    assert result["replies_read"] is False
    effect = next(p["effect"] for p in result["problems"] if "SMTP_USER" in p["setting"])
    assert "IMAP_USER" in effect


def test_half_a_mailbox_is_no_mailbox():
    assert readiness.check(without("SMTP_PASSWORD"))["replies_read"] is False
    assert readiness.check(without("SMTP_USER"))["replies_read"] is False


def test_blank_values_count_as_unset():
    # Render shows an empty variable as present.
    result = readiness.check({**GOOD, "ENGINE_API_KEY": "   "})
    assert "ENGINE_API_KEY" in criticals(result)


def test_no_model_credentials_is_critical():
    result = readiness.check(without("OPENROUTER_API_KEY"))
    assert result["ready"] is False
    assert "OPENROUTER_API_KEY" in criticals(result)


class TestReport:
    def test_names_every_problem_it_found(self):
        text = readiness.format_report(readiness.check(without("ENGINE_API_KEY")))
        assert "ENGINE_API_KEY" in text
        assert "CRITICAL" in text

    def test_says_so_when_there_is_nothing_wrong(self):
        text = readiness.format_report(readiness.check(GOOD))
        assert "no problems found" in text
        assert "CRITICAL" not in text

    def test_does_not_print_any_secret(self):
        text = readiness.format_report(readiness.check(GOOD))
        # db-password is in there because ENGINE_DATABASE_URL carries one
        # inline, and the report is read in a deploy log.
        for secret in ("engine-key", "or-key", "re-key", "mailbox-password", "db-password"):
            assert secret not in text


class TestEnforce:
    def test_refuses_to_start_on_a_critical_problem(self, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        monkeypatch.delenv("ENGINE_ALLOW_INCOMPLETE", raising=False)
        for k, v in GOOD.items():
            monkeypatch.setenv(k, v)
        monkeypatch.delenv("ENGINE_API_KEY")

        with pytest.raises(RuntimeError, match="ENGINE_API_KEY"):
            readiness.enforce()

    def test_starts_when_the_override_is_set(self, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        for k, v in GOOD.items():
            monkeypatch.setenv(k, v)
        monkeypatch.delenv("ENGINE_API_KEY")
        monkeypatch.setenv("ENGINE_ALLOW_INCOMPLETE", "1")

        assert readiness.enforce()["ready"] is False

    def test_starts_cleanly_when_everything_is_configured(self, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        monkeypatch.delenv("ENGINE_ALLOW_INCOMPLETE", raising=False)
        for k, v in GOOD.items():
            monkeypatch.setenv(k, v)

        assert readiness.enforce()["ready"] is True

    def test_never_blocks_a_test_run(self, monkeypatch):
        monkeypatch.setenv("TESTING", "1")
        monkeypatch.delenv("ENGINE_API_KEY", raising=False)
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

        assert readiness.enforce()["ready"] is False
