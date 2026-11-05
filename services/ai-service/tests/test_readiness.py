"""The configuration check.

Each case is a real way this service can be deployed wrong while coming up
perfectly healthy, which is the reason the check exists.
"""

import pytest

from app import readiness
from app.config import Settings


def settings_of(tmp_path, **overrides):
    base = {
        "local_api_key": "service-key",
        "openrouter_api_key": "or-key",
        "storage_encryption_key": "enc-key",
    }
    base.update(overrides)
    return Settings(
        storage_dir=tmp_path / "data",
        cache_dir=tmp_path / "cache",
        database_path=tmp_path / "billfixr.sqlite3",
        log_file=tmp_path / "billfixr.log",
        **base,
    )


def names(result):
    return {p.setting for p in result.problems}


def criticals(result):
    return {p.setting for p in result.problems if p.severity == "critical"}


def test_a_fully_configured_service_is_ready(tmp_path):
    result = readiness.check(settings_of(tmp_path))
    assert result.ready is True
    assert result.problems == ()


def test_an_open_service_is_critical(tmp_path):
    result = readiness.check(settings_of(tmp_path, local_api_key=None))
    assert result.ready is False
    assert "LOCAL_API_KEY" in criticals(result)


def test_the_open_service_warning_names_what_else_stops_being_enforced(tmp_path):
    # The point most easily missed: without a key it is not only the key
    # check that is skipped. app/auth.py returns auth_enabled=False, and
    # both require_roles and can_access_owner then pass unconditionally.
    result = readiness.check(settings_of(tmp_path, local_api_key=None))
    effect = next(p.effect for p in result.problems if p.setting == "LOCAL_API_KEY")
    assert "ownership" in effect
    assert "any uploaded bill" in effect


def test_no_extraction_provider_is_critical(tmp_path):
    result = readiness.check(settings_of(tmp_path, openrouter_api_key=None))
    assert result.ready is False
    assert "OPENROUTER_API_KEY" in criticals(result)


def test_an_openai_key_counts_as_a_provider(tmp_path):
    # Either provider will do; demanding the OpenRouter one specifically
    # would condemn a service that is correctly configured.
    result = readiness.check(settings_of(tmp_path, openrouter_api_key=None, openai_api_key="oa-key"))
    assert result.ready is True
    assert result.ai_configured is True


def test_plaintext_storage_warns_but_does_not_stop_the_service(tmp_path):
    result = readiness.check(settings_of(tmp_path, storage_encryption_key=None))
    assert result.ready is True
    assert result.storage_encrypted is False
    assert "STORAGE_ENCRYPTION_KEY" in names(result)


class TestReport:
    def test_names_every_problem_found(self, tmp_path):
        text = readiness.format_report(readiness.check(settings_of(tmp_path, local_api_key=None)))
        assert "LOCAL_API_KEY" in text
        assert "CRITICAL" in text

    def test_says_so_when_nothing_is_wrong(self, tmp_path):
        text = readiness.format_report(readiness.check(settings_of(tmp_path)))
        assert "no problems found" in text
        assert "CRITICAL" not in text

    def test_prints_no_secret(self, tmp_path):
        text = readiness.format_report(readiness.check(settings_of(tmp_path)))
        for secret in ("service-key", "or-key", "enc-key"):
            assert secret not in text

    def test_is_ascii_so_it_survives_any_terminal(self, tmp_path):
        text = readiness.format_report(readiness.check(settings_of(tmp_path, local_api_key=None)))
        assert text.isascii()


class TestEnforce:
    def test_refuses_to_start_on_a_critical_gap(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        monkeypatch.delenv("AI_SERVICE_ALLOW_INCOMPLETE", raising=False)

        with pytest.raises(RuntimeError, match="LOCAL_API_KEY"):
            readiness.enforce(settings_of(tmp_path, local_api_key=None))

    def test_starts_when_the_override_is_set(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        monkeypatch.setenv("AI_SERVICE_ALLOW_INCOMPLETE", "1")

        assert readiness.enforce(settings_of(tmp_path, local_api_key=None)).ready is False

    def test_starts_cleanly_when_everything_is_configured(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        monkeypatch.delenv("AI_SERVICE_ALLOW_INCOMPLETE", raising=False)

        assert readiness.enforce(settings_of(tmp_path)).ready is True

    def test_never_blocks_a_test_run(self, tmp_path, monkeypatch):
        monkeypatch.setenv("TESTING", "1")
        assert readiness.enforce(settings_of(tmp_path, local_api_key=None)).ready is False
