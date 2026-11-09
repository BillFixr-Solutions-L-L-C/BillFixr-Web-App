"""
Looks up a hospital's billing contacts, from a sourced directory first and the federal NPI registry second.

It never guesses. A field the provider does not publish comes back empty
with a note saying so. Hospitals rarely publish a billing email, so most
matches return a postal address and a phone number but no email.

Two sources, in this order:

1. engine/provider_directory.json -- hand-curated, each field traced to the
   hospital's own pages. It is the only source that can carry a billing
   EMAIL, because no public dataset has one. It covers a few dozen
   hospitals, so it cannot be the only source.
2. The NPPES registry (engine/nppes.py) -- CMS's record of every enumerated
   US provider. It gives a mailing address, phone and fax for essentially
   any US facility, which is what makes this work for a hospital nobody has
   curated. It has no email field at all.
3. A web search (engine/contact_search.py) -- for the email the first two
   cannot give. Hospitals publish billing addresses on their own sites even
   though no dataset collects them. The model must say which page it read
   the address on, and that page is then fetched and checked here, so what
   comes back is an address the provider published on its own domain, not
   an address a model produced.

So a directory hit and a registry hit answer different questions, and the
registry never overwrites a curated field. A registry-only answer is enough
to post a letter and to ring the billing line; it is not enough to send an
email, and `billing_email` stays None so the send path still refuses rather
than mailing a guess.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from . import contact_search, nppes
from .nppes import ProviderCandidate

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
    # From the NPI registry. A postal address is the one contact detail that
    # is available for almost every US provider, so it is what a customer
    # whose hospital publishes no email is left with.
    mailing_address: Optional[str] = None
    npi: Optional[str] = None
    facility_type: Optional[str] = None
    fax: Optional[str] = None
    # Other facilities that matched the name. One hospital registers several
    # NPIs -- the hospital, its lab, its clinic -- so the caller confirms
    # rather than having one picked for them.
    candidates: List[ProviderCandidate] = []
    # The page a searched-for email was read from, when the email came from
    # the web rather than the directory. Kept so a wrong address can be
    # traced to what published it.
    email_source_url: Optional[str] = None


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
        registry = nppes.resolve(provider_name, address)

        if entry is None:
            return self._from_registry(provider_name, address, registry)

        # A curated field is traced to the hospital's own page by hand, so
        # it wins. The search only fills what the entry does not have.
        searched = (
            contact_search.search_emails(provider_name, address)
            if not (entry.get("billing_email") and entry.get("support_email"))
            else {}
        )
        billing = searched.get("billing")
        support = searched.get("support")
        billing_email = entry.get("billing_email") or (billing.email if billing else None)
        support_email = entry.get("support_email") or (support.email if support else None)

        notes = entry.get("notes", "")
        if not billing_email:
            notes = (notes + " " if notes else "") + "This hospital publishes no billing email. Use the phone number or its billing page, or enter an email yourself."
        elif not entry.get("billing_email") and billing:
            notes = (notes + " " if notes else "") + f"Billing email found on {billing.page_domain}."
        if not address and entry.get("states"):
            notes = (notes + " " if notes else "") + "No address was given, so confirm this is the right location."

        # The registry fills the gaps the curated entry leaves and never
        # overwrites it: a field traced to the hospital's own page beats a
        # field the hospital self-reported to CMS and may not have touched
        # in years.
        best = registry[0] if registry else None
        return ProviderContact(
            provider_name=entry["name"],
            billing_email=billing_email,
            support_email=support_email,
            phone=entry.get("phone") or (best.phone if best else None),
            billing_url=entry.get("billing_url"),
            sources=entry.get("sources", [])
            + ([best.source_url] if best and best.source_url else [])
            + [f.source_url for f in (billing, support) if f],
            verification_status=entry.get("verification_status", "unverified"),
            notes=notes,
            mailing_address=best.mailing_address if best else None,
            npi=best.npi if best else None,
            facility_type=best.facility_type if best else None,
            fax=best.fax if best else None,
            candidates=registry,
            email_source_url=(billing.source_url if billing and not entry.get("billing_email") else None),
        )

    def _from_registry(
        self, provider_name: str, address: Optional[str], registry: List[ProviderCandidate]
    ) -> ProviderContact:
        """An answer for a hospital nobody has curated: the registry, plus a search for the email."""
        # The registry has no email field, so this is the only way most
        # hospitals get one at all. It is checked against the page it was
        # published on before it reaches here -- see contact_search.
        searched = contact_search.search_emails(provider_name, address)
        billing = searched.get("billing")
        support = searched.get("support")
        found_note = ""
        if billing:
            found_note = f" Billing email found on {billing.page_domain}."
        elif support:
            found_note = f" Support email found on {support.page_domain}."

        if not registry:
            if not (billing or support):
                return ProviderContact(
                    notes=(
                        f"No billing contact was found for '{provider_name}', in our directory, in the "
                        "federal NPI registry, or on the web. BillFixr does not guess hospital contacts. "
                        "Check the spelling against the name printed on the bill, or enter the billing "
                        "email yourself."
                    )
                )
            # CMS does not know this provider under that name, but its own
            # site publishes an address. That is enough to send to, and it
            # is the only thing a send actually requires.
            return ProviderContact(
                provider_name=provider_name.strip(),
                billing_email=billing.email if billing else None,
                support_email=support.email if support else None,
                sources=[f.source_url for f in (billing, support) if f],
                verification_status="listed",
                notes=(
                    "Not found in the federal NPI registry, so there is no postal address or phone "
                    "number for this one." + found_note
                ).strip(),
                email_source_url=(billing or support).source_url,
            )

        best = registry[0]
        notes = (
            f"Found in the federal NPI registry (NPI {best.npi})"
            + (f", listed as a {best.facility_type.lower()}" if best.facility_type else "")
            + "."
        )
        if billing or support:
            notes += found_note
        else:
            notes += (
                " The registry carries no email address and none was found on the hospital's own site, "
                "so the postal address and phone number below are what it has. Ring the billing line "
                "for an email, or post the letter."
            )
        if len(registry) > 1:
            notes += f" {len(registry) - 1} other facility match this name - check this is the right one."
        if not address:
            notes += " No address was given, so confirm this is the right location."

        return ProviderContact(
            provider_name=best.name,
            billing_email=billing.email if billing else None,
            support_email=support.email if support else None,
            phone=best.phone,
            billing_url=None,
            sources=([best.source_url] if best.source_url else [])
            + [f.source_url for f in (billing, support) if f],
            # "listed", never "verified": the registry half is self-reported
            # to CMS and goes stale -- it shows a Chicago fax for a hospital
            # in Tennessee. A searched email is checked against the page
            # that published it, and email_source_url says which page that
            # was, but nobody has read it by hand either.
            verification_status="listed",
            notes=notes,
            mailing_address=best.mailing_address,
            npi=best.npi,
            facility_type=best.facility_type,
            fax=best.fax,
            candidates=registry,
            email_source_url=(billing or support).source_url if (billing or support) else None,
        )
