"""What is and is not configured, and what each gap actually costs.

/health already reports most of this as booleans. What was missing is
anything that looks at them: a service deployed with no API key and no
encryption key comes up perfectly healthy, serves every route to anyone
who can reach it, and writes medical bills to disk in plaintext. Nothing
in a deploy log says so.

This runs at startup, prints what it found, and refuses to start on the
gaps that are not survivable.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from app.config import Settings


@dataclass(frozen=True)
class Problem:
    severity: str  # "critical" | "warning"
    setting: str
    effect: str


@dataclass(frozen=True)
class Readiness:
    ready: bool
    auth_enabled: bool
    ai_configured: bool
    storage_encrypted: bool
    problems: tuple[Problem, ...]


def check(settings: Settings) -> Readiness:
    problems: list[Problem] = []

    auth_enabled = bool(settings.local_api_key)
    ai_configured = bool(settings.openai_api_key or settings.openrouter_api_key)
    storage_encrypted = bool(settings.storage_encryption_key)

    if not auth_enabled:
        problems.append(Problem(
            "critical",
            "LOCAL_API_KEY",
            # Not just the key check: with auth off, get_current_principal
            # returns a principal with auth_enabled=False, and both the role
            # checks and the per-owner access checks pass unconditionally.
            "Every route is open, and role and document-ownership checks are skipped entirely. "
            "Anyone who can reach this service can read any uploaded bill.",
        ))

    if not ai_configured:
        problems.append(Problem(
            "critical",
            "OPENROUTER_API_KEY",
            "No extraction provider is configured, so bills cannot be read.",
        ))

    if not storage_encrypted:
        problems.append(Problem(
            "warning",
            "STORAGE_ENCRYPTION_KEY",
            "Uploaded bills are written to the disk in plaintext.",
        ))

    return Readiness(
        ready=not any(p.severity == "critical" for p in problems),
        auth_enabled=auth_enabled,
        ai_configured=ai_configured,
        storage_encrypted=storage_encrypted,
        problems=tuple(problems),
    )


def format_report(result: Readiness) -> str:
    """The startup banner. ASCII, because this is read in a deploy log."""
    lines = ["BillFixr ai-service - configuration check"]
    lines.append(f"  API key required      : {'yes' if result.auth_enabled else 'NO'}")
    lines.append(f"  extraction configured : {'yes' if result.ai_configured else 'NO'}")
    lines.append(f"  bills encrypted at rest: {'yes' if result.storage_encrypted else 'NO'}")
    if not result.problems:
        lines.append("  no problems found")
    for p in result.problems:
        lines.append(f"  [{p.severity.upper()}] {p.setting}: {p.effect}")
    return "\n".join(lines)


def enforce(settings: Settings) -> Readiness:
    """Checks at startup, and refuses to start on a critical gap.

    Set AI_SERVICE_ALLOW_INCOMPLETE=1 to start anyway - for local work, not
    for anywhere holding a real person's medical bill.
    """
    result = check(settings)
    print(format_report(result), flush=True)

    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"):
        return result
    if result.ready or os.getenv("AI_SERVICE_ALLOW_INCOMPLETE", "").strip():
        return result

    critical = [p for p in result.problems if p.severity == "critical"]
    raise RuntimeError(
        "Refusing to start: "
        + "; ".join(f"{p.setting} - {p.effect}" for p in critical)
        + " Set AI_SERVICE_ALLOW_INCOMPLETE=1 to override."
    )
