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
    """Accept the address only if the page it was claimed from actually carries it."""
    email = (email or "").strip().strip(".,;:<>()[]").lower()
    source_url = (source_url or "").strip()
    if not email or not _EMAIL_RE.fullmatch(email) or not source_url:
        return None
    if not _is_public_url(source_url):
        return None

    email_domain = _registrable(email.split("@", 1)[1])
    page_host = urllib.parse.urlparse(source_url).hostname or ""
    # The address has to be published on the domain it belongs to. This is
    # what separates "the hospital says to write here" from "some page on
    # the internet contains this string".
    if _registrable(page_host) != email_domain:
        return None

    try:
        page = _fetch_page(source_url)
    except Exception:  # noqa: BLE001 -- an unreachable page is a failed check, not an error
        return None
    if email not in page.lower():
        return None

    return EmailFind(email=email, source_url=source_url, page_domain=page_host)


def search_emails(provider_name: str, address: Optional[str] = None) -> Dict[str, EmailFind]:
    """Billing and support email for one provider, or {} -- never a guess.

    One search answers both, so pressing both buttons on the form costs one
    search rather than two.
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

    question = f"Hospital or clinic: {provider_name.strip()}"
    if (address or "").strip():
        # The address is what keeps this on the right building. Searching a
        # name alone returned the Nashville campus for a Smyrna clinic.
        question += f"\nAddress on the bill: {address.strip()}"
    question += "\n\nFind the billing department email, and the patient support email if there is one."

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
    except Exception:  # noqa: BLE001 -- the lookup degrades to "no email", which is a normal answer
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

    _cache[key] = (time.time(), found)
    return found


def probe() -> Dict[str, Any]:
    """Can this deployment run a contact search at all? Never raises.

    Same reason as the registry probe: every test runs against a recorded
    reply, so nothing else would notice that the key is missing or that
    egress to OpenRouter is blocked -- both of which look exactly like a
    hospital that publishes no email.
    """
    if os.getenv("CONTACT_SEARCH_DISABLED", "").strip():
        return {"reachable": False, "disabled": True}
    if not os.getenv("OPENROUTER_API_KEY", "").strip():
        return {"reachable": False, "disabled": False, "error": "OPENROUTER_API_KEY is not set"}

    started = time.time()
    try:
        _chat({"model": MODEL, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}, os.environ["OPENROUTER_API_KEY"])
    except Exception as err:  # noqa: BLE001 -- a health check reports, it does not fail
        return {
            "reachable": False,
            "disabled": False,
            "error": type(err).__name__,
            "elapsed_ms": int((time.time() - started) * 1000),
        }
    return {
        "reachable": True,
        "disabled": False,
        "model": MODEL,
        "elapsed_ms": int((time.time() - started) * 1000),
    }
