"""What is and is not configured, and what each gap actually costs.

Every failure this reports has the same shape: the engine keeps running
and looks fine. A missing API key does not break a request, it serves it
to anyone. An ADVOCATE_EMAIL on the wrong domain does not raise, it sends
over untracked SMTP instead. Missing IMAP credentials do not log an error,
they leave a negotiation waiting forever on a reply that already arrived.

None of that shows up in a deploy log unless something goes looking, so
this runs at startup and prints the result, and /api/health reports it.
"""

import os
from typing import Any, Dict, List, Optional

# Letters are sent through Resend, which only accepts a From address on a
# domain verified for the account. Anything else is rejected and the engine
# falls back to SMTP, which reports nothing back to the web app.
SENDING_DOMAIN = os.getenv("RESEND_SENDING_DOMAIN", "billfixr.com").lower()


def _set(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def check(env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Reports configuration state. Reads os.environ unless given a mapping."""
    get = (env or os.environ).get

    def present(name: str) -> bool:
        return bool((get(name) or "").strip())

    advocate = (get("ADVOCATE_EMAIL") or get("SMTP_FROM") or "").strip().lower()
    resend = present("RESEND_API_KEY")
    # The poller authenticates to IMAP with the SMTP pair. There is no
    # IMAP_USER, which is the single easiest thing to get wrong here.
    mailbox = present("SMTP_USER") and present("SMTP_PASSWORD")

    problems: List[Dict[str, str]] = []

    if not present("ENGINE_API_KEY"):
        problems.append({
            "severity": "critical",
            "setting": "ENGINE_API_KEY",
            "effect": "Every API route except the health check is open to anyone who can reach this service.",
        })

    if not present("OPENROUTER_API_KEY"):
        problems.append({
            "severity": "critical",
            "setting": "OPENROUTER_API_KEY",
            "effect": "No letters can be written and no bill images can be read.",
        })

    if not resend:
        problems.append({
            "severity": "warning",
            "setting": "RESEND_API_KEY",
            "effect": (
                "Letters go out over SMTP, which reports nothing back. "
                "Delivery, bounces and opens will never reach the web app, "
                "and the admin screen will show nothing for any letter sent."
            ),
        })
    elif not advocate:
        problems.append({
            "severity": "critical",
            "setting": "ADVOCATE_EMAIL",
            "effect": "No From address, so nothing can be sent.",
        })
    elif not advocate.endswith("@" + SENDING_DOMAIN):
        problems.append({
            "severity": "critical",
            "setting": "ADVOCATE_EMAIL",
            "effect": (
                f"'{advocate}' is not on {SENDING_DOMAIN}. Resend only sends from a verified "
                "domain, so every send is rejected and the engine falls back to untracked SMTP. "
                "This failure looks like success: letters appear to go out and nothing errors."
            ),
        })

    if not mailbox:
        problems.append({
            "severity": "warning",
            "setting": "SMTP_USER / SMTP_PASSWORD",
            "effect": (
                "The inbox poller is not configured, so replies from providers are never read "
                "and no negotiation can advance. Note these are the IMAP credentials too - "
                "there is no IMAP_USER."
            ),
        })

    return {
        "ready": not any(p["severity"] == "critical" for p in problems),
        "letters_tracked": resend,
        "replies_read": mailbox,
        "api_protected": present("ENGINE_API_KEY"),
        "advocate_email": advocate or None,
        "problems": problems,
    }


def format_report(result: Dict[str, Any]) -> str:
    """The startup banner. Plain lines, because this is read in a deploy log."""
    lines = ["BillFixr automation engine - configuration check"]
    lines.append(f"  letters tracked (Resend) : {'yes' if result['letters_tracked'] else 'NO'}")
    lines.append(f"  replies read (IMAP)      : {'yes' if result['replies_read'] else 'NO'}")
    lines.append(f"  API key required         : {'yes' if result['api_protected'] else 'NO'}")
    lines.append(f"  sending as               : {result['advocate_email'] or '(unset)'}")
    if not result["problems"]:
        lines.append("  no problems found")
    for p in result["problems"]:
        lines.append(f"  [{p['severity'].upper()}] {p['setting']}: {p['effect']}")
    return "\n".join(lines)


def enforce() -> Dict[str, Any]:
    """Checks at startup, and refuses to start when something is critical.

    Starting anyway would mean serving an open API, or sending letters that
    no one can track, for as long as it took someone to notice. Set
    ENGINE_ALLOW_INCOMPLETE=1 to start regardless - for local work, not for
    anywhere a real hospital can be written to.
    """
    result = check()
    print(format_report(result), flush=True)

    if os.getenv("TESTING") or os.getenv("PYTEST_CURRENT_TEST"):
        return result
    if result["ready"] or _set("ENGINE_ALLOW_INCOMPLETE"):
        return result

    critical = [p for p in result["problems"] if p["severity"] == "critical"]
    raise RuntimeError(
        "Refusing to start: "
        + "; ".join(f"{p['setting']} - {p['effect']}" for p in critical)
        + " Set ENGINE_ALLOW_INCOMPLETE=1 to override."
    )
