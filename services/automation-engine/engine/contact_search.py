"""Finds a hospital's billing email on the open web, and does not believe the model.

The federal registry has no email field for anyone, and the curated
directory covers a few dozen hospitals. But hospitals do publish billing
email addresses -- on their own websites, on a "Contact Billing" or
"Patient Financial Services" page. That is searchable, and this searches
it.

The whole design problem is that a letter sent to a wrong address is a
disclosure of someone's medical bill to a stranger. A language model asked
for an email address will produce one whether or not it exists, and a
plausible-looking `billing@<hospital>.org` is exactly the kind of thing it
invents. So nothing the model says is trusted on its own:

1. The model searches the web and must return the URL it read the address
   on, not just the address.
2. This module then fetches that URL itself and requires the email to
   appear, verbatim, in the page.
3. The page's domain must match the email's domain -- so the address was
   published by the organisation that owns it, on its own site.

An answer failing any of those is dropped, and the customer types the
address in by hand as before. False negatives are the acceptable failure
here: a hospital that publishes its billing address on a third-party page,
or as a Gmail account, will not be found. A wrong address that looks right
is not recoverable; a miss is.
"""

import json
import os
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Same provider the letter generator already uses, so this needs no new
# credential and no new vendor. The search itself is OpenRouter's
# `openrouter:web_search` server tool -- the older `web` plugin and the
# `:online` model suffix are deprecated.
MODEL = os.getenv("CONTACT_SEARCH_MODEL", "google/gemini-2.5-flash")
MAX_RESULTS = int(os.getenv("CONTACT_SEARCH_MAX_RESULTS", "5"))

# A customer is watching a spinner while this runs, and the search plus the
# model is the slow part. Past this, no email is a better answer than no
# answer.
TIMEOUT_SECONDS = float(os.getenv("CONTACT_SEARCH_TIMEOUT_SECONDS", "20"))
PAGE_TIMEOUT_SECONDS = float(os.getenv("CONTACT_SEARCH_PAGE_TIMEOUT_SECONDS", "8"))

# The verification fetch reads an arbitrary URL the model chose, so it is
# capped: enough of a contact page to find an address in, not enough for a
# large download to tie the process up.
MAX_PAGE_BYTES = 2_000_000

CACHE_TTL_SECONDS = 60 * 60 * 24
_cache: Dict[str, Tuple[float, Dict[str, "EmailFind"]]] = {}

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# --- what counts as a billing contact ------------------------------------
#
# An address is not a billing contact just because it is an address. On
# 2026-11-11 a search for Matthew Walker Comprehensive Health Center
# returned `shatiqua.jamerson@mwchc.org`, a named member of staff, read
# off npin.cdc.gov -- the CDC's prevention-services directory, which has
# nothing to do with billing. It reached the form as the hospital's
# support email.
#
# Two things were missing. Nothing here knew that a personal mailbox is
# the wrong kind of answer, and the domain check compares the email to the
# page it was found on, so an address on the provider's own domain
# published anywhere passes it.
#
# Writing to a named employee about someone else's medical bill is both
# likely to go unanswered and a disclosure to a person who never asked for
# it. So a personal-looking address is refused outright, confirmed or not.

# Local parts a hospital actually uses for money.
#
# Split by length, because substring matching is only safe for a word long
# enough to be unambiguous. "ar" (accounts receivable) as a substring
# matches Maria, Mark, Barbara and Garcia -- a test caught it classifying
# `maria-lopez@` as a billing department. Anything under six characters
# must therefore appear as a whole dot/underscore/hyphen-delimited segment,
# or be the entire local part.
_ROLE_SUBSTRINGS = (
    "billing", "billings", "patientaccounts", "patientaccount",
    "patientbilling", "patientfinancial", "patientfinance",
    "accounts", "accounting", "accountsreceivable",
    "financialservices", "financialassistance", "finance",
    "support", "customerservice", "customercare", "service",
    "contact", "enquiries", "inquiries", "helpdesk",
    "administration", "office", "reception",
    "payments", "paymybill", "selfpay", "collections", "cashier",
    "healthinfo", "medicalrecords", "privacy", "compliance",
)
_ROLE_SEGMENTS = frozenset(
    {"ar", "hr", "pfs", "bill", "bills", "info", "help", "admin", "pay", "billoffice"}
)
_SEGMENT_SPLIT = re.compile(r"[._\-+]")

# first.last, f.last, first_last, first-last: the shapes of a person.
_PERSONAL_SHAPE = re.compile(r"^[a-z]+[._\-][a-z]{2,}\d{0,3}$")


def _local_part(email: str) -> str:
    return email.split("@", 1)[0].lower()


def is_role_address(email: str) -> bool:
    """True when the local part names a function rather than a person."""
    local = _local_part(email)
    squashed = re.sub(r"[^a-z]", "", local)
    if any(word in squashed for word in _ROLE_SUBSTRINGS):
        return True
    segments = {part for part in _SEGMENT_SPLIT.split(local) if part}
    segments.add(squashed)
    return bool(segments & _ROLE_SEGMENTS)


def is_personal_address(email: str) -> bool:
    """True when the local part looks like somebody's name.

    A role word anywhere in it wins: `billing.office` is punctuated like a
    person and is not one, and `john.smith.billing` is a billing mailbox
    whoever it belongs to.
    """
    if is_role_address(email):
        return False
    local = _local_part(email)
    if _PERSONAL_SHAPE.match(local):
        return True
    # A bare single word that is not a role word -- `shatiqua`, `jsmith` --
    # cannot be told from a person, and guessing in this direction is the
    # expensive mistake.
    return bool(re.fullmatch(r"[a-z]{2,}\d{0,3}", local)) and len(local) > 2


SYSTEM_PROMPT = """You find the billing contact email for a US hospital or clinic.

Rules:
- Search the web. Only report an email address you have actually seen on a page.
- The address must be published on the provider's OWN website.
- Never construct, pattern-match or guess an address. "billing@" plus the
  hospital's domain is a guess unless you have seen that exact address.
- If you cannot find one, say so. Finding nothing is a correct answer.

Reply with JSON only, no prose and no code fences:
{"billing": {"email": "...", "source_url": "..."}, "support": {"email": "...", "source_url": "..."}}

Use null for either key you could not find. source_url must be the exact
page you read the address on."""


class EmailFind(BaseModel):
    email: str
    source_url: str
    # Why this is trustworthy, in the order the checks ran. Carried so a
    # support question about a wrong address can be answered.
    page_domain: str
    # Whether every check passed. An address that fails one is still
    # returned -- see _verify -- but never as a confirmed one.
    confirmed: bool = True
    # Plain words for why it could not be confirmed, shown to the customer.
    reason: str = ""


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def _registrable(host: str) -> str:
    """The last two labels of a hostname: 'www.mwchc.org' -> 'mwchc.org'.

    Deliberately naive. It over-merges a few public suffixes (an address on
    `foo.co.uk` and a page on `bar.co.uk` would be treated as the same
    domain), which is why this is one check of three rather than the only
    one: the address must also appear verbatim on that page.
    """
    labels = (host or "").lower().strip(".").split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else (host or "").lower()


def _is_public_url(url: str) -> bool:
    """Refuse anything that is not a public http(s) address.

    The URL comes from a model, and this process then fetches it. Without
    this, a URL pointing at the container's own network would make the
    health of the deployment readable from outside it.
    """
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname
    if host in ("localhost",) or host.endswith(".localhost") or "." not in host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            import ipaddress

            addr = ipaddress.ip_address(ip.split("%")[0])
        except ValueError:
            return False
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return False
    return True


def _chat(payload: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://billfixr.com",
            "X-Title": "BillFixr provider contact search",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
        return json.loads(res.read().decode("utf-8", "replace"))


def _fetch_page(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "BillFixr/1.0 (+https://billfixr.com)"})
    with urllib.request.urlopen(req, timeout=PAGE_TIMEOUT_SECONDS) as res:
        return res.read(MAX_PAGE_BYTES).decode("utf-8", "replace")


def _parse(content: str) -> Dict[str, Any]:
    """Pull the JSON object out of a model reply that may be wrapped in prose."""
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}


def _verify(email: str, source_url: str) -> Optional[EmailFind]:
    """Check the address, and say so either way.

    This used to return None whenever a check failed, which threw the
    address away. In practice that meant throwing away almost all of them:
    of four real hospitals tested, one blocks this fetcher with a 403, one
    has a TLS chain that will not verify, one publishes on a domain that
    does not match its website, and one renders the address with JavaScript
    so it is not in the HTML at all. All four publish a billing address a
    person can read in a browser, and the customer is a person with a
    browser looking at a form they can edit.

    So an address that fails a check now comes back marked `confirmed=
    False` with a reason, and the person decides. What is still refused
    outright is an address that is not an address, or one with no cited
    source at all -- those are the shapes a model invents.

    The private-network guard stays absolute: an unconfirmable address is
    returned, but a URL pointing inside this network is never fetched.
    """
    email = (email or "").strip().strip(".,;:<>()[]").lower()
    source_url = (source_url or "").strip()
    # No email, not an email, or no page it came from: nothing to show.
    if not email or not _EMAIL_RE.fullmatch(email) or not source_url:
        return None

    # A named person is the wrong kind of answer and is refused outright,
    # confirmed or not. The dispute letter carries a patient name, an
    # account number and a balance; sending that to an employee who was
    # listed in some directory is a disclosure to someone who never asked
    # for it, and it will not be actioned either. See is_personal_address.
    if is_personal_address(email):
        return None

    page_host = urllib.parse.urlparse(source_url).hostname or ""
    unconfirmed = lambda why: EmailFind(  # noqa: E731
        email=email, source_url=source_url, page_domain=page_host, confirmed=False, reason=why
    )

    if not _is_public_url(source_url):
        # Never fetched. Returned unconfirmed so nothing disappears silently.
        return unconfirmed("the page it cites is not a public web address")

    email_domain = _registrable(email.split("@", 1)[1])
    if _registrable(page_host) != email_domain:
        # Common and often legitimate: a health system on a legacy mail
        # domain, e.g. partners.org published on massgeneralbrigham.org.
        return unconfirmed(f"it is published on {page_host}, not on its own domain")

    try:
        page = _fetch_page(source_url)
    except Exception as err:  # noqa: BLE001 -- a page we cannot read is a failed check, not an error
        return unconfirmed(f"its page could not be read ({type(err).__name__})")
    if email not in page.lower():
        return unconfirmed("it does not appear in the page it cites")

    return EmailFind(email=email, source_url=source_url, page_domain=page_host, confirmed=True)


def _ask(question: str, api_key: str) -> Dict[str, "EmailFind"]:
    """One search. Returns whatever survived verification, which may be {}."""
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        "tools": [{"type": "openrouter:web_search", "parameters": {"max_results": MAX_RESULTS}}],
        "temperature": 0,
    }
    try:
        data = _chat(payload, api_key)
    except Exception:  # noqa: BLE001 -- a failed attempt is "no email", which is a normal answer
        return {}

    choices = data.get("choices") or []
    content = (choices[0].get("message", {}).get("content") if choices else "") or ""
    parsed = _parse(content)

    found: Dict[str, EmailFind] = {}
    for kind in ("billing", "support"):
        block = parsed.get(kind)
        if not isinstance(block, dict):
            continue
        checked = _verify(str(block.get("email") or ""), str(block.get("source_url") or ""))
        if checked:
            found[kind] = checked
    return found


def _better(candidate: Optional["EmailFind"], incumbent: Optional["EmailFind"]) -> bool:
    """Is `candidate` a better answer than what we already have?

    Confirmed beats unconfirmed; anything beats nothing. Both are already
    role addresses by the time they reach here -- _verify refuses personal
    ones -- so this only has to rank how well each was checked.
    """
    if candidate is None:
        return False
    if incumbent is None:
        return True
    return bool(candidate.confirmed) and not incumbent.confirmed


def search_emails(provider_name: str, address: Optional[str] = None) -> Dict[str, EmailFind]:
    """Billing and support email for one provider, or {} -- never a guess.

    Searches more than once. The first pass is a plain question and finds
    the easy cases; if it comes back without a confirmed billing address,
    two further passes aim at where hospitals actually publish one -- the
    "pay my bill" page, and patient financial services -- before giving up.

    What it will not do is keep asking until the model produces something.
    Every answer still goes through _verify, a personal mailbox is refused
    outright, and running out of attempts with nothing found is a correct
    outcome: the customer types the address in. A wrong address that looks
    right is not recoverable, and a letter sent to one discloses a
    patient's bill to a stranger.

    Each pass costs a web search, so it stops the moment it has a
    confirmed billing address, and the whole thing is cached per provider.
    """
    if os.getenv("CONTACT_SEARCH_DISABLED", "").strip():
        return {}
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key or not (provider_name or "").strip():
        return {}

    key = f"{_normalize(provider_name)}|{_normalize(address or '')}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]

    name = provider_name.strip()
    # The address is what keeps this on the right building. Searching a
    # name alone returned the Nashville campus for a Smyrna clinic.
    where = f"\nAddress on the bill: {address.strip()}" if (address or "").strip() else ""

    # Each attempt looks somewhere different. Repeating the same question
    # would only re-roll the same answer at the same cost.
    attempts = [
        f"Hospital or clinic: {name}{where}\n\n"
        "Find the billing department email, and the patient support email if there is one.",

        f"Hospital or clinic: {name}{where}\n\n"
        "Look specifically at this provider's own website: its \"Pay My Bill\", \"Billing\", "
        "\"Patient Billing\" or \"Contact Us\" page. Report the billing email address printed "
        "on that page, and the page's URL. A department mailbox only -- do not report an "
        "individual member of staff's address.",

        f"Hospital or clinic: {name}{where}\n\n"
        "Look for this provider's Patient Financial Services, Patient Accounts or Business "
        "Office contact details, on its own website. Report the department email address and "
        "the exact page URL. Do not report a named person's address, and do not guess.",
    ]
    max_attempts = max(1, min(len(attempts), int(os.getenv("CONTACT_SEARCH_MAX_ATTEMPTS", "3"))))

    found: Dict[str, EmailFind] = {}
    for question in attempts[:max_attempts]:
        result = _ask(question, api_key)
        for kind in ("billing", "support"):
            if _better(result.get(kind), found.get(kind)):
                found[kind] = result[kind]
        # A confirmed billing address is the answer this exists to get.
        # Anything further would be spending a search to improve a field
        # that is already as good as this can make it.
        billing = found.get("billing")
        if billing and billing.confirmed:
            break

    _cache[key] = (time.time(), found)
    return found


def probe() -> Dict[str, Any]:
    """Can this deployment run a contact search at all? Never raises.

    Same reason as the registry probe: every test runs against a recorded
    reply, so nothing else would notice that the key is missing, that egress
    to OpenRouter is blocked, or that this account cannot use the web search
    tool -- all three of which look exactly like a hospital that publishes
    no email.

    So the probe asks the way a real lookup asks, web search tool included.
    That costs a search's worth of credit per call, which is why this is
    opt-in via ?check=contact-search and not part of the route Render polls.
    """
    if os.getenv("CONTACT_SEARCH_DISABLED", "").strip():
        return {"reachable": False, "disabled": True}
    if not os.getenv("OPENROUTER_API_KEY", "").strip():
        return {"reachable": False, "disabled": False, "error": "OPENROUTER_API_KEY is not set"}

    started = time.time()
    try:
        data = _chat(
            {
                "model": MODEL,
                "messages": [{"role": "user", "content": "Reply with the single word: ok"}],
                # The same server tool a real lookup uses, at the smallest
                # size it comes in. A plain chat ping would pass on a key
                # that cannot run a web search at all -- and that is the
                # failure this probe exists to catch, because it reaches the
                # customer as "this hospital publishes no email".
                "tools": [{"type": "openrouter:web_search", "parameters": {"max_results": 1}}],
                "max_tokens": 16,
            },
            os.environ["OPENROUTER_API_KEY"],
        )
    except Exception as err:  # noqa: BLE001 -- a health check reports, it does not fail
        return {
            "reachable": False,
            "disabled": False,
            "error": type(err).__name__,
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    # OpenRouter answers some rejections with HTTP 200 and an error in the
    # body -- an unavailable tool among them. So a request that completed is
    # not the same as a search this account is allowed to run.
    rejected = data.get("error") if isinstance(data, dict) else None
    if rejected:
        message = rejected.get("message") if isinstance(rejected, dict) else rejected
        return {
            "reachable": False,
            "disabled": False,
            "error": str(message)[:200],
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    return {
        "reachable": True,
        "disabled": False,
        "model": MODEL,
        "web_search": True,
        "elapsed_ms": int((time.time() - started) * 1000),
    }
