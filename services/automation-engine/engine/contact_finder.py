"""
Looks up a hospital's billing contacts in a sourced directory (engine/provider_directory.json).

It never guesses. A hospital that is not in the directory, or a field the hospital does not publish,
comes back empty with a note saying so. Hospitals rarely publish a billing email, so many matches
return a phone number and a billing page but no email.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

DIRECTORY_PATH = os.getenv("PROVIDER_DIRECTORY_PATH") or os.path.join(os.path.dirname(__file__), "provider_directory.json")


class ProviderContact(BaseModel):
    provider_name: Optional[str] = None
    billing_email: Optional[str] = None
    support_email: Optional[str] = None
    phone: Optional[str] = None
    billing_url: Optional[str] = None
    sources: List[str] = []
    verification_status: str = "unverified"  # "verified", "listed", or "unverified"
    notes: str = ""


def _normalize(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split())


def _mentions_state(address: str, states: List[str]) -> bool:
    for state in states:
        # Two-letter codes match as whole uppercase words ("NY"), names match in any case.
        pattern = rf"\b{state}\b" if len(state) == 2 else rf"\b{re.escape(state)}\b"
        flags = 0 if len(state) == 2 else re.IGNORECASE
        if re.search(pattern, address, flags):
            return True
    return False


class ProviderContactFinder:
    def __init__(self, directory_path: Optional[str] = None):
        with open(directory_path or DIRECTORY_PATH, encoding="utf-8") as f:
            self.providers: List[Dict[str, Any]] = json.load(f)["providers"]

    def _match(self, name: str, address: Optional[str]) -> Optional[Dict[str, Any]]:
        clean_name = _normalize(name)
        for entry in self.providers:
            if not any(re.search(rf"\b{re.escape(_normalize(k))}\b", clean_name) for k in entry["keywords"]):
                continue
            # A similar name in another state is a different hospital. Without an address we cannot tell.
            if address and entry.get("states") and not _mentions_state(address, entry["states"]):
                continue
            return entry
        return None

    def find_contact(self, provider_name: str, address: Optional[str] = None) -> ProviderContact:
        if not (provider_name or "").strip():
            return ProviderContact(notes="No hospital name was given. Enter the hospital's billing email yourself.")

        entry = self._match(provider_name, address)
        if entry is None:
            return ProviderContact(
                notes=(
                    f"No confirmed billing contact is on file for '{provider_name}'. "
                    "BillFixr does not guess hospital contacts. Enter the hospital's billing email yourself."
                )
            )

        notes = entry.get("notes", "")
        if not entry.get("billing_email"):
            notes = (notes + " " if notes else "") + "This hospital publishes no billing email. Use the phone number or its billing page, or enter an email yourself."
        if not address and entry.get("states"):
            notes = (notes + " " if notes else "") + "No address was given, so confirm this is the right location."

        return ProviderContact(
            provider_name=entry["name"],
            billing_email=entry.get("billing_email"),
            support_email=entry.get("support_email"),
            phone=entry.get("phone"),
            billing_url=entry.get("billing_url"),
            sources=entry.get("sources", []),
            verification_status=entry.get("verification_status", "unverified"),
            notes=notes,
        )
