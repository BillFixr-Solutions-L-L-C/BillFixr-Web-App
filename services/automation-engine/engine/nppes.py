"""
Resolves a free-text provider name to a real US facility using the federal NPI registry (NPPES).

Why this exists: engine/provider_directory.json is hand-curated, and a
hand-curated file cannot cover the ~6,000 hospitals and the hundreds of
thousands of billing entities in the US. NPPES is the CMS registry of
every enumerated provider, is public, needs no key, and carries each
facility's mailing address, phone and fax. That puts a postal address
within reach for essentially any US provider, instead of the handful we
typed in by hand.

What it does NOT carry: email. There is no email field in NPPES, so this
module never sets a billing email. An email still has to come from the
curated directory or from the customer. Postal address and phone are what
this buys.

Two properties of the registry shape the code here:

1. `organization_name` matches a PREFIX only, and it searches d/b/a names
   as well as the legal name. "ascension rutherford" matches nothing as a
   prefix, but "ascension*" finds SAINT THOMAS RUTHERFORD HOSPITAL through
   its d/b/a "ASCENSION SAINT THOMAS RUTHERFORD". So we query distinctive
   tokens as prefixes and rank the pool by how much of the typed name each
   candidate's names cover.

2. One facility holds several NPIs -- the acute-care hospital, its lab and
   its clinic all share a name and a street. Picking one automatically
   would silently address a bill dispute to a laboratory, so this returns
   ranked candidates and leaves the choice to the caller.

The data is self-reported by providers and goes stale: the registry lists
a Chicago fax number (312-462-6293) for a hospital in Murfreesboro,
Tennessee. Treat it as "listed", never "verified", and keep the NPI beside
it so a human can check the entry. The fax numbers in particular should not
be trusted without a human checking the registry page.

Known limitation, measured rather than assumed: a correct STATE is
effectively required for any large system's name. The registry caps a
response at 200 records, so a national search for "ascension*" truncates
long before it reaches the hospital in Murfreesboro, and because matching
is on a name's PREFIX, "rutherford*" never matches "SAINT THOMAS RUTHERFORD
HOSPITAL" at all. With the state, the same search narrows to 70 and finds
it. When the state on the bill is wrong, this returns no match rather than
a confident address for the wrong organisation.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

API_URL = "https://npiregistry.cms.hhs.gov/api/"
TIMEOUT_SECONDS = float(os.getenv("NPPES_TIMEOUT_SECONDS", "8"))
CACHE_TTL_SECONDS = 60 * 60 * 24

# How many prefixes to try before giving up. Bounds the worst case: a
# lookup that matches nothing would otherwise walk every phrase length and
# every token, one HTTP round trip each, while a customer waits.
MAX_QUERIES = 6

# Words that appear in half the hospital names in the country. Querying
# "medical*" or "health*" returns noise and burns a round trip, so they are
# never used as the search prefix -- though they still count when scoring,
# because "Memorial Health" against "Memorial Hospital" is a real
# distinction once we already have the candidates in hand.
GENERIC_WORDS = {
    "hospital", "hospitals", "medical", "center", "centers", "centre",
    "health", "healthcare", "the", "and", "for", "inc", "llc",
    "system", "systems", "clinic", "clinics", "group", "services",
    "service", "care", "saint", "university", "regional", "community",
    "memorial", "general", "associates", "physicians", "department",
}

# NPPES taxonomy prefixes, ranked by how likely the entry is to be the body
# that issued a hospital bill. A laboratory shares the hospital's name and
# street but is not who you write to about the bill.
_FACILITY_RANK: List[Tuple[str, int, str]] = [
    ("282N", 3, "General acute care hospital"),
    ("283", 3, "Specialty hospital"),
    ("281", 3, "Hospital unit"),
    ("282", 3, "Hospital"),
    ("261Q", 2, "Clinic or health center"),
    ("3104", 1, "Supplier"),
    ("291U", 0, "Clinical laboratory"),
    ("291", 0, "Laboratory"),
]

_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


class ProviderCandidate(BaseModel):
    npi: str
    name: str                       # the name a customer would recognise
    legal_name: Optional[str] = None
    facility_type: Optional[str] = None
    mailing_address: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    score: int = 0
    source_url: Optional[str] = None


def _tokens(text: Optional[str]) -> List[str]:
    return [t for t in re.findall(r"[a-z]+", (text or "").lower()) if len(t) > 2]


def _state_from(address: Optional[str]) -> Optional[str]:
    """A two-letter state code from a free-text address, if one is plainly there.

    Deliberately strict. The addresses customers type are often not the
    hospital's -- live rows in this app carry a Wyoming registered-agent
    address against a Tennessee hospital -- and a wrong state filter hides
    the right hospital, so callers retry without one.
    """
    text = (address or "").strip()
    match = re.search(r",\s*([A-Z]{2})\s+\d{5}", text)
    if match:
        return match.group(1)
    match = re.search(r"\b([A-Z]{2})\b,?\s*(?:USA?)?\s*$", text)
    return match.group(1) if match else None


def _facility(taxonomies: List[Dict[str, Any]]) -> Tuple[int, Optional[str]]:
    primary = next((t for t in taxonomies if t.get("primary")), None)
    if primary is None:
        primary = taxonomies[0] if taxonomies else {}
    code = (primary.get("code") or "").upper()
    desc = primary.get("desc") or None
    for prefix, rank, _label in _FACILITY_RANK:
        if code.startswith(prefix):
            return rank, desc
    return 1, desc


def _request(params: Dict[str, Optional[str]]) -> Dict[str, Any]:
    query: Dict[str, str] = {k: v for k, v in params.items() if v}
    query.update(version="2.1", enumeration_type="NPI-2", limit="200")
    url = API_URL + "?" + urllib.parse.urlencode(query)

    cached = _cache.get(url)
    if cached is not None and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    req = urllib.request.Request(
        url, headers={"User-Agent": "BillFixr/1.0 (+https://www.billfixr.com)"}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
        data = json.loads(res.read().decode("utf-8"))
    _cache[url] = (time.time(), data)
    return data


def _names(result: Dict[str, Any]) -> List[str]:
    names = [(result.get("basic") or {}).get("organization_name") or ""]
    names += [(o.get("organization_name") or "") for o in result.get("other_names") or []]
    return [n for n in names if n]


def _candidate(
    result: Dict[str, Any], typed: List[str], required: int, address: Optional[str] = None
) -> Optional[ProviderCandidate]:
    names = _names(result)
    if not names:
        return None

    # Two separate jobs here, and conflating them was a bug: `required`
    # decides whether this is a match at all, and the score only orders the
    # matches. When a single distinctive word was enough to qualify, the one
    # unrelated "Ascension" registered in Wyoming counted as a match for
    # "ascension rutherford" and stopped the search ever widening to the
    # Tennessee hospital the customer meant.
    best_name, best_score, best_overlap = names[0], 0, 0
    for name in names:
        name_tokens = set(_tokens(name))
        overlap = sum(1 for t in typed if t in name_tokens)
        specific = sum(1 for t in typed if t in name_tokens and t not in GENERIC_WORDS)
        if specific < 1 or overlap < required:
            continue
        weighted = overlap + specific          # a distinctive word counts double
        if weighted > best_score:
            best_name, best_score, best_overlap = name, weighted, overlap
    if not best_overlap:
        return None

    addresses = result.get("addresses") or []
    mailing = next((a for a in addresses if a.get("address_purpose") == "MAILING"), None)
    location = next((a for a in addresses if a.get("address_purpose") == "LOCATION"), None)

    # These two serve different purposes and conflating them picked the
    # wrong hospital. A group's MAILING address is often its central billing
    # office -- every Vanderbilt hospital mails to one suite in Nashville --
    # which is exactly where a billing dispute should be posted. The
    # LOCATION address is the building the patient was treated in, and is
    # what says which hospital this is.
    addr = mailing or location or {}            # where the letter goes
    site = location or mailing or {}            # which facility this is
    tel = site.get("telephone_number") or addr.get("telephone_number")

    rank, desc = _facility(result.get("taxonomies") or [])
    street = " ".join(p for p in [addr.get("address_1"), addr.get("address_2")] if p)
    postal = addr.get("postal_code") or ""
    if len(postal) == 9:
        postal = f"{postal[:5]}-{postal[5:]}"
    region = f"{addr.get('state') or ''} {postal}".strip()
    full = ", ".join(p for p in [street, addr.get("city"), region] if p)

    # A big system puts its name on facilities in a dozen towns, and the
    # name alone cannot separate them: "vanderbilt" with a Clarksville
    # address was resolving to Vanderbilt Bedford Hospital in Nashville,
    # picked by nothing better than alphabetical order. The town is sitting
    # right there in the address the customer gave us. Worth more than the
    # taxonomy rank, worth less than one more word of the name matching.
    locality = 0
    haystack = (address or "").lower()
    site_postal = site.get("postal_code") or ""
    if haystack:
        if site.get("city") and site["city"].lower() in haystack:
            locality = 5
        elif site_postal[:5] and site_postal[:5] in haystack:
            locality = 5

    # Among equally good matches, prefer the plain street address over one
    # routed to a named person or a clinical department: the registry holds
    # several records for the same hospital, and "9500 Euclid Ave" is a
    # better place to post a billing dispute than "9500 Euclid Ave,
    # Department of Radiology". Only ever breaks a tie.
    upper = street.upper()
    routed = -1 if any(m in upper for m in ("ATTN", "DEPT", "DEPARTMENT")) else 0

    npi = str(result.get("number"))
    return ProviderCandidate(
        npi=npi,
        name=best_name.title(),
        legal_name=(result.get("basic") or {}).get("organization_name"),
        facility_type=desc,
        mailing_address=full or None,
        phone=tel,
        fax=addr.get("fax_number"),
        city=site.get("city"),
        state=site.get("state"),
        score=best_score * 10 + locality + rank + routed,
        source_url=f"https://npiregistry.cms.hhs.gov/provider-view/{npi}",
    )


def _search_terms(provider_name: str) -> List[str]:
    """The prefixes to try, most selective first.

    The registry matches a prefix of a whole registered name, so the typed
    phrase is itself a query -- and a far better one than any single word of
    it. Measured against the live registry: "saint thomas rutherford*"
    returns 3 records, all of them the right facility, while "thomas*"
    returns 50 and "saint thomas*" returns 68. The phrase is selective
    enough that it does not even need a state, which is what rescues a bill
    carrying the wrong one.

    Single tokens stay on the end of the list, because a phrase prefix only
    works when the customer typed the start of a registered name.
    "ascension rutherford" is the start of nothing -- it needs "ascension*"
    plus the scorer to find the hospital through its d/b/a.
    """
    words = [w for w in re.findall(r"[a-z]+", (provider_name or "").lower()) if len(w) > 1]
    if not words:
        return []

    # Hospitals are registered under "Saint" far more often than "St", and a
    # customer types whichever is on the bill. "st thomas rutherford*"
    # returns nothing; "saint thomas rutherford*" returns the hospital.
    variants = [words]
    if "st" in words:
        variants.append(["saint" if w == "st" else w for w in words])
    elif "saint" in words:
        variants.append(["st" if w == "saint" else w for w in words])

    terms: List[str] = []
    for variant in variants:
        # Longest phrase first, then drop a word off the end at a time. The
        # trailing words are usually the generic ones ("... medical center"),
        # and a registered name often stops before them.
        for length in range(len(variant), 1, -1):
            terms.append(" ".join(variant[:length]))

    distinctive = [w for w in words if w not in GENERIC_WORDS and len(w) > 2]
    terms.extend(distinctive[:3])

    seen, ordered = set(), []
    for term in terms:
        if term not in seen:
            seen.add(term)
            ordered.append(term)
    return ordered


def _ranked(
    terms: List[str], typed: List[str], state: Optional[str], required: int,
    address: Optional[str] = None,
) -> List[ProviderCandidate]:
    """Try each prefix in turn and stop at the first one that actually matches something.

    Stopping early is the point: the terms are ordered most selective
    first, so the first one to match is the best-targeted query we have, and
    going on would only pour a few hundred weaker records into the pool for
    the scorer to sift. It also keeps the usual lookup to one HTTP round
    trip.
    """
    for term in terms[:MAX_QUERIES]:
        params: Dict[str, Optional[str]] = {"organization_name": f"{term}*"}
        if state:
            params["state"] = state
        try:
            data = _request(params)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            continue

        pool = {str(r.get("number")): r for r in data.get("results") or []}
        candidates = [c for c in (_candidate(r, typed, required, address) for r in pool.values()) if c is not None]
        if candidates:
            candidates.sort(key=lambda c: (-c.score, c.name))
            return candidates
    return []


def resolve(provider_name: str, address: Optional[str] = None, limit: int = 5) -> List[ProviderCandidate]:
    """Ranked facilities matching a free-text name. Empty list on no match, or on any failure.

    Never raises. A registry that is slow or down has to leave the customer
    on the manual-entry path, not on an error page.
    """
    # Read at call time, not import time, so a test or an operator can turn
    # the registry off without reloading the module. The suite sets it, so a
    # test of the curated directory never depends on CMS being up.
    if os.getenv("NPPES_DISABLED", "").strip():
        return []

    typed = _tokens(provider_name)
    if not typed:
        return []

    distinctive = [t for t in typed if t not in GENERIC_WORDS]
    if not distinctive:
        # Nothing but words like "medical center" or "community hospital".
        # There is no prefix here that identifies anyone, and querying
        # "medical*" would return a few hundred unrelated facilities for the
        # scorer to pick a plausible-looking winner out of. No match is the
        # honest answer.
        return []

    state = _state_from(address)
    terms = _search_terms(provider_name)

    # One distinctive word is enough only when that is all the customer gave
    # us ("Vanderbilt"). Given two, both have to land.
    required = 2 if len(distinctive) >= 2 else 1

    # Narrow by state first, because a name like "Mount Sinai" belongs to
    # unrelated hospitals in different states. Then widen if that found
    # nothing worth having -- the address a customer types is frequently not
    # the hospital's, and live rows in this app carry a Wyoming
    # registered-agent address against a Tennessee hospital. The retry turns
    # on whether anything SCORED, not on whether the registry returned rows:
    # there is one "Ascension" registered in Wyoming, and counting that as a
    # result would stop the search ever reaching the hospital in Tennessee.
    candidates = _ranked(terms, typed, state, required, address)
    if not candidates and state:
        candidates = _ranked(terms, typed, None, required, address)

    # Collapse the duplicate NPIs one facility registers at one address,
    # keeping the best-ranked. Otherwise a hospital, its lab and its clinic
    # fill the list and read as three different hospitals.
    seen = set()
    unique: List[ProviderCandidate] = []
    for cand in candidates:
        key = (cand.name.lower(), (cand.mailing_address or "").lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(cand)
    return unique[:limit]
