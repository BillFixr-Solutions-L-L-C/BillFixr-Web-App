from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_RE = re.compile(r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b")
SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
LONG_NUMBER_RE = re.compile(r"\b\d{7,}\b")


def redact_phi(value: Any) -> Any:
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, dict):
        return {key: redact_phi(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_phi(item) for item in value]
    return value


def _redact_text(value: str) -> str:
    redacted = EMAIL_RE.sub("[redacted-email]", value)
    redacted = PHONE_RE.sub("[redacted-phone]", redacted)
    redacted = SSN_RE.sub("[redacted-ssn]", redacted)
    redacted = LONG_NUMBER_RE.sub("[redacted-number]", redacted)
    return redacted
