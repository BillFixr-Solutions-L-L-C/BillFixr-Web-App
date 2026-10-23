"""
AI Negotiation Engine and Inbound Hospital Response Parser for BillFixr.
Handles:
- HIPAA Authorization & Representation packet generation
- DeepSeek V3 analysis of inbound hospital emails/portal messages
- Autonomous counter-offer recommendations with human-in-the-loop approval
"""

import os
import json
import re
from typing import Dict, Any, List, Optional
import httpx
from dotenv import load_dotenv

from database import NegotiationRepository
from engine.config import ADVOCATE_EMAIL
from engine.payments import completion_fee, savings_amount
from engine.revised_bill import check_revised_bill, read_pdf, save_pdf
from engine.audit_engine import CITATIONS, HOLD_FOR_REVIEW as AUTOPILOT_HOLD_FOR_REVIEW, findings_for_letter

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
REASONING_MODEL = "deepseek/deepseek-chat"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

INBOUND_ANALYSIS_SYSTEM_PROMPT = """You are an expert Healthcare Financial Advocate and Inbound Hospital Communications Negotiator.
Your job is to read and analyze an inbound correspondence from a hospital or clinic billing department in response to a patient's medical bill dispute and settlement offer.

Analyze the message carefully and extract:
1. Decision Category: Select exactly ONE from:
   - "OFFER_ACCEPTED" (Hospital agreed to patient's settlement offer)
   - "COUNTER_OFFER" (Hospital offered a partial discount or specific revised dollar amount)
   - "CHARITY_CARE_DOCS_REQUESTED" (Hospital requests income proof, W-2, tax return, or financial assistance form)
   - "ITEMIZED_BILL_PROVIDED" (Hospital sent or agreed to provide itemized UB-04 / CPT statement)
   - "DISPUTE_REJECTED" (Hospital rejects dispute and demands full balance)
   - "HIPAA_AUTH_REQUESTED" (Hospital requires signed patient authorization form before proceeding)
   - "GENERAL_INQUIRY" (Hospital acknowledged dispute or requested clarification)

2. Extracted Dollar Figures:
   - revised_demanded_balance: New balance demanded by hospital (float or null if unchanged)
   - hospital_counter_amount: Discounted settlement figure offered by hospital (float or null)

3. Deal Evaluation:
   - is_great_deal: true if the hospital accepted or offered a substantial reduction (≥40-50% discount from original charge or close to patient's settlement target); otherwise false.
   - deal_rating: "excellent", "fair", or "poor"

4. Sentiment: "cooperative", "neutral", or "adversarial"

5. Executive Summary: 1-2 concise sentences explaining the hospital's response to the patient.

6. Recommended Action: Concrete guidance on the best next strategic move for the patient.

7. Suggested Next Counter Offer: Suggested next dollar figure to offer (float).

8. Pre-drafted Rebuttal / Reply Letter: A complete, formal, professional reply letter in Markdown.

Respond ONLY with a valid JSON object matching this structure:
{
  "category": "COUNTER_OFFER",
  "revised_demanded_balance": 175.00,
  "hospital_counter_amount": 175.00,
  "is_great_deal": true,
  "deal_rating": "excellent",
  "sentiment": "cooperative",
  "summary": "Hospital offered a substantial discount reducing the balance to $175.00.",
  "recommended_action": "Auto-accept this excellent settlement offer.",
  "suggested_next_offer": 175.00,
  "drafted_reply_markdown": "Complete formal letter text here..."
}
Do not include any text outside the JSON block.
"""

def generate_hipaa_authorization(
    patient_name: str,
    provider_name: str,
    account_number: str,
    dob: str = "On File"
) -> str:
    """
    Generates a formal HIPAA Designation of Authorized Representative form (45 CFR § 164.508).
    """
    return f"""# DESIGNATION OF AUTHORIZED REPRESENTATIVE & HIPAA RELEASE OF INFORMATION
**(Pursuant to 45 C.F.R. § 164.508 and State Patient Privacy Laws)**

**1. PATIENT IDENTIFICATION:**
- **Patient Name:** {patient_name}
- **Date of Birth:** {dob}
- **Provider / Facility:** {provider_name}
- **Account / Medical Record Number:** {account_number}

**2. APPOINTMENT OF AUTHORIZED ADVOCATE:**
I, **{patient_name}**, hereby designate **BillFixr Patient Financial Advocacy Services** and its authorized agents as my designated personal representative for the sole purpose of reviewing, auditing, disputing, and negotiating the financial and billing records associated with Account #{account_number}.

**3. SCOPE OF AUTHORIZED DISCLOSURE:**
This authorization permits {provider_name} to release and discuss with my designated representative all itemized billing statements, UB-04 / CMS-1500 claim forms, payment histories, chargemaster line-item descriptions, and financial assistance applications. This authorization does **not** grant access to psychotherapy notes or substance abuse records.

**4. REVOCATION & EXPIRATION:**
This authorization remains valid for one (1) year from the date of execution or until written revocation is provided to the billing office. A photocopy or electronic reproduction of this authorization shall be considered as valid as the original.

**ELECTRONIC SIGNATURE & CONSENT:**
Signed: *{patient_name}* (Electronically signed & verified)  
Date: Current Date
"""

# Statuses where autopilot must not send follow-ups: settled, finished, or waiting on a person.
STOP_FOLLOW_UP_STATUSES = {"HOSPITAL_ACCEPTED", "HELD_FOR_REVIEW", "SETTLEMENT_AGREED", "AWAITING_COMPLETION_FEE", "COMPLETED", "CLOSED_NO_RESPONSE", "SETTLED"}

# AUTOPILOT_HOLD_FOR_REVIEW comes from engine/audit_engine.py. It is off by default.

REVISED_BILL_PATTERN = re.compile(
    r"(revised|updated|corrected|new|itemized)\s+(itemized\s+)?(bill|statement)",
    re.IGNORECASE,
)


def autopilot_blocked(neg: Dict[str, Any]) -> bool:
    """True when autopilot must hold any send because a finding still needs a person to review it."""
    if not AUTOPILOT_HOLD_FOR_REVIEW:
        return False
    issues = (neg.get("audit_summary") or {}).get("issues", [])
    return any(issue.get("confidence") != "high" for issue in issues)


def add_client_notice(negotiation_id: str, subject: str, body: str) -> None:
    """Shows the client a notice in the case timeline. Notices never leave the app."""
    NegotiationRepository.add_message(
        negotiation_id=negotiation_id,
        direction="SYSTEM",
        sender="BillFixr",
        recipient="Client",
        subject=subject,
        content_markdown=body,
        status="SENT",
    )


def looks_like_revised_bill(text: str, category: str) -> bool:
    return category == "ITEMIZED_BILL_PROVIDED" or bool(REVISED_BILL_PATTERN.search(text or ""))


def settle_and_request_revised_bill(neg: Dict[str, Any], accepted_amount: float) -> Dict[str, Any]:
    """Accepts the hospital's offer on the shared thread, asks for a revised bill, and tells the client."""
    from datetime import datetime, timezone
    from engine.email_dispatcher import email_dispatcher

    tracking_code = neg["tracking_code"]
    provider_name = neg["provider_name"]
    account_number = neg["account_number"]
    total_billed = float(neg.get("total_billed") or accepted_amount)
    target = neg.get("hospital_email") or ""
    if not target:
        raise ValueError("Hospital billing email is missing, so the settlement cannot be sent.")

    root_msg_id = neg.get("root_message_id") or f"<{tracking_code}-0@billfixr.com>"
    last_parent_id = neg.get("last_message_id") or root_msg_id
    thread_refs = f"{root_msg_id} {last_parent_id}".strip() if root_msg_id != last_parent_id else root_msg_id
    subject = f"Re: Formal Billing Dispute & Settlement Offer [{tracking_code}]"

    body = f"""# SETTLEMENT ACCEPTANCE & REQUEST FOR REVISED BILL

**Date:** {datetime.now(timezone.utc).strftime('%B %d, %Y')}
**Healthcare Provider:** {provider_name}
**Account / Invoice #:** {account_number}
**Dispute Reference:** {tracking_code}

Thank you for reviewing this account. We accept your settlement of **${accepted_amount:,.2f}** in full and final satisfaction of Account #{account_number}, which was originally billed at ${total_billed:,.2f}.

Please send a **revised itemized bill** to this thread showing a balance of **$0.00** after the agreed settlement of ${accepted_amount:,.2f}, and confirm that no further collection activity will occur.

Sincerely,
**BillFixr Patient Financial Advocacy (Auto-Pilot)**
"""

    receipt = email_dispatcher.dispatch_dispute_packet(
        recipient_email=target,
        support_email=neg.get("support_email") or target,
        subject=subject,
        letter_markdown=body,
        tracking_code=tracking_code,
        patient_email="",
        sender_email=ADVOCATE_EMAIL,
        include_legal_attachment=False,
        in_reply_to=last_parent_id,
        references=thread_refs,
    )

    NegotiationRepository.add_message(
        negotiation_id=neg["id"],
        direction="OUTBOUND",
        sender="BillFixr Advocate (Auto-Pilot)",
        recipient=target,
        subject=subject,
        content_markdown=body,
        analysis={"event": "SETTLEMENT_ACCEPTED", "accepted_amount": accepted_amount},
        proposed_action={"recommended_action": "Waiting for the hospital to send a revised bill."},
        status="SENT",
        message_id_header=receipt.get("message_id"),
        in_reply_to_header=last_parent_id,
        references_header=thread_refs,
    )

    NegotiationRepository.update_fields(
        neg["id"], settled_amount=accepted_amount, current_offer=accepted_amount, status="SETTLEMENT_AGREED"
    )
    add_client_notice(
        neg["id"],
        "Hospital accepted your offer",
        f"The hospital accepted ${accepted_amount:,.2f}. We have asked for a revised bill that shows this amount. You will be notified when it arrives.",
    )
    return receipt


def build_rebuttal_markdown(neg: Dict[str, Any]) -> str:
    """Builds the rebuttal from the audit. Automatic sends use this template, not free-form AI text.

    Free-form drafts can invent offers and cite outside authorities, so they are not sent automatically.
    """
    issues = findings_for_letter((neg.get("audit_summary") or {}).get("issues", []))
    findings = "\n".join(
        f"- {i.get('title')}: ${float(i.get('disputed_amount') or 0):,.2f} ({i.get('statute')})" for i in issues
    ) or "- Request for itemized statement and fee review"
    return f"""# Response to your determination on Account #{neg['account_number']}

Thank you for your response. We do not accept that the full balance is due without the documentation below.

The patient has a right to an itemized statement ({CITATIONS['itemized_statement']}). Before any balance is paid, please provide:

1. A complete itemized UB-04 or CMS-1500 statement for all charges on this account.
2. The supporting documentation for each item below:

{findings}

Our settlement offer of ${float(neg.get('current_offer') or 0):,.2f} remains open for 30 days from the date of this letter.

Sincerely,
**BillFixr Patient Financial Advocacy (Auto-Pilot)**
"""


def send_dispute_rebuttal(neg: Dict[str, Any]) -> Dict[str, Any]:
    """Answers a rejected dispute on the shared thread, asking for the itemized bill and documentation."""
    from datetime import datetime, timezone
    from engine.email_dispatcher import email_dispatcher

    tracking_code = neg["tracking_code"]
    target = neg.get("hospital_email") or ""
    if not target:
        raise ValueError("Hospital billing email is missing, so the rebuttal cannot be sent.")
    root_msg_id = neg.get("root_message_id") or f"<{tracking_code}-0@billfixr.com>"
    last_parent_id = neg.get("last_message_id") or root_msg_id
    thread_refs = f"{root_msg_id} {last_parent_id}".strip() if root_msg_id != last_parent_id else root_msg_id
    subject = f"Re: Formal Billing Dispute & Settlement Offer [{tracking_code}]"
    body = build_rebuttal_markdown(neg)

    receipt = email_dispatcher.dispatch_dispute_packet(
        recipient_email=target,
        support_email=neg.get("support_email") or target,
        subject=subject,
        letter_markdown=body,
        tracking_code=tracking_code,
        patient_email="",
        sender_email=ADVOCATE_EMAIL,
        include_legal_attachment=False,
        in_reply_to=last_parent_id,
        references=thread_refs,
    )
    NegotiationRepository.add_message(
        negotiation_id=neg["id"],
        direction="OUTBOUND",
        sender="BillFixr Advocate (Auto-Pilot)",
        recipient=target,
        subject=subject,
        content_markdown=body,
        analysis={"event": "DISPUTE_REBUTTAL", "generated_at": datetime.now(timezone.utc).isoformat()},
        proposed_action={"recommended_action": "Waiting for the itemized bill and documentation."},
        status="SENT",
        message_id_header=receipt.get("message_id"),
        in_reply_to_header=last_parent_id,
        references_header=thread_refs,
    )
    add_client_notice(
        neg["id"],
        "Hospital rejected the dispute",
        "We have answered the hospital's rejection and asked for the itemized bill and the documentation for each disputed item.",
    )
    return receipt


def request_bill_correction(neg: Dict[str, Any], check: Dict[str, Any]) -> None:
    """Tells the hospital its revised bill does not show the agreed amount, and tells the client we are on it."""
    from engine.email_dispatcher import email_dispatcher

    tracking_code = neg["tracking_code"]
    target = neg.get("hospital_email") or ""
    if not target:
        raise ValueError("Hospital billing email is missing, so the correction request cannot be sent.")
    root_msg_id = neg.get("root_message_id") or f"<{tracking_code}-0@billfixr.com>"
    last_parent_id = neg.get("last_message_id") or root_msg_id
    thread_refs = f"{root_msg_id} {last_parent_id}".strip() if root_msg_id != last_parent_id else root_msg_id
    subject = f"Re: Formal Billing Dispute & Settlement Offer [{tracking_code}]"
    body = f"""# REQUEST FOR A CORRECTED REVISED BILL

Account #{neg['account_number']} | Dispute Reference: {tracking_code}

Thank you for the revised statement. It does not show the agreed settlement of **${check['settled_amount']:,.2f}**.

Please send a corrected itemized statement that shows the settled amount of ${check['settled_amount']:,.2f} and a remaining balance of $0.00.

Sincerely,
**BillFixr Patient Financial Advocacy (Auto-Pilot)**
"""
    receipt = email_dispatcher.dispatch_dispute_packet(
        recipient_email=target, support_email=neg.get("support_email") or target, subject=subject,
        letter_markdown=body, tracking_code=tracking_code, patient_email="",
        sender_email=ADVOCATE_EMAIL, include_legal_attachment=False,
        in_reply_to=last_parent_id, references=thread_refs,
    )
    NegotiationRepository.add_message(
        negotiation_id=neg["id"], direction="OUTBOUND", sender="BillFixr Advocate (Auto-Pilot)", recipient=target,
        subject=subject, content_markdown=body,
        analysis={"event": "REVISED_BILL_CORRECTION_REQUESTED", "check": check},
        proposed_action={"recommended_action": "Waiting for a corrected revised bill."},
        status="SENT", message_id_header=receipt.get("message_id"),
        in_reply_to_header=last_parent_id, references_header=thread_refs,
    )
    NegotiationRepository.update_fields(neg["id"], status="SETTLEMENT_AGREED")
    add_client_notice(
        neg["id"],
        "Revised bill needs a correction",
        f"The hospital's revised bill does not show the agreed ${check['settled_amount']:,.2f}. We have asked them to correct it.",
    )


async def process_revised_bill(
    neg: Dict[str, Any], email_text: str, pdf_bytes: Optional[bytes] = None, filename: str = "revised_bill.pdf"
) -> Dict[str, Any]:
    """Reads the email and the PDF, checks the agreed amount, and only then asks the client to pay."""
    pdf_text = await read_pdf(pdf_bytes, filename) if pdf_bytes else ""
    check = None
    if pdf_bytes:
        settled = float(neg.get("settled_amount") or neg.get("current_offer") or 0.0)
        check = check_revised_bill(f"{email_text}\n{pdf_text}", settled)
        if not check["passed"]:
            NegotiationRepository.update_fields(neg["id"], revised_bill_check_json=json.dumps(check))
            request_bill_correction(neg, check)
            return NegotiationRepository.get_negotiation(neg["id"])
    pdf_path = save_pdf(neg["id"], pdf_bytes) if pdf_bytes else None
    bill_text = "\n\n".join(part.strip() for part in (email_text, pdf_text) if part and part.strip())
    return receive_revised_bill(neg, bill_text, pdf_path, check)


def receive_revised_bill(
    neg: Dict[str, Any], bill_text: str, pdf_path: Optional[str] = None, check: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Stores the hospital's revised bill, works out the completion fee, and asks the client to pay it."""
    from datetime import datetime, timezone

    settled = float(neg.get("settled_amount") or neg.get("current_offer") or 0.0)
    total_billed = float(neg.get("total_billed") or settled)
    fee = completion_fee(total_billed, settled, neg.get("completion_fee_rate"))
    savings = savings_amount(total_billed, settled)
    now = datetime.now(timezone.utc).isoformat()
    stored = {"revised_bill_pdf_path": pdf_path, "revised_bill_check_json": json.dumps(check) if check else None}

    if fee <= 0:
        NegotiationRepository.update_fields(
            neg["id"], revised_bill_markdown=bill_text, revised_bill_received_at=now,
            completion_fee=0.0, completion_paid=1, completion_paid_at=now, status="COMPLETED", **stored,
        )
        add_client_notice(neg["id"], "Negotiation complete", "No completion fee is due. Your new bill is available.")
    else:
        NegotiationRepository.update_fields(
            neg["id"], revised_bill_markdown=bill_text, revised_bill_received_at=now,
            completion_fee=fee, status="AWAITING_COMPLETION_FEE", **stored,
        )
        add_client_notice(
            neg["id"],
            "Negotiation complete: completion fee due",
            f"The hospital has sent your revised bill. You saved ${savings:,.2f}. Pay the completion fee of ${fee:,.2f} to access your new bill.",
        )
    return NegotiationRepository.get_negotiation(neg["id"])


class NegotiationService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENROUTER_API_KEY
        if not self.api_key:
            load_dotenv(override=True)
            self.api_key = os.getenv("OPENROUTER_API_KEY", "")

    async def analyze_hospital_response(
        self,
        negotiation_id: str,
        hospital_message_text: str,
        sender_email: str = "billing@provider.example",
        subject: str = "RE: Medical Bill Dispute",
        inbound_message_id: Optional[str] = None,
        inbound_in_reply_to: Optional[str] = None,
        inbound_references: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Analyzes an inbound response from the hospital billing department,
        persists the message to SQLite with RFC 5322 threading headers,
        evaluates deal quality, and in Auto-Pilot mode automatically accepts
        and dispatches confirmation on the same thread when a great deal is reached.
        """
        neg = NegotiationRepository.get_negotiation(negotiation_id)
        if not neg:
            raise ValueError(f"Negotiation {negotiation_id} not found.")

        current_offer = float(neg.get("current_offer", 0.0) or 0.0)
        current_demanded = float(neg.get("current_demanded_balance", 0.0) or 0.0)
        total_billed = float(neg.get("total_billed", current_demanded) or current_demanded)
        orig_balance = float(neg.get("original_balance_due", total_billed) or total_billed)
        patient_name = neg["patient_name"]
        provider_name = neg["provider_name"]
        account_number = neg["account_number"]
        tracking_code = neg["tracking_code"]
        auto_pilot_enabled = bool(neg.get("auto_pilot_enabled", 1))

        # Update last_message_id on negotiation if inbound_message_id provided
        if inbound_message_id:
            NegotiationRepository.update_threading(negotiation_id, last_message_id=inbound_message_id)

        prompt = f"""
Hospital / Provider: {provider_name}
Patient Name: {patient_name}
Account #: {account_number}
Tracking Code: {tracking_code}
Patient Original Balance: ${orig_balance:,.2f}
Patient Previous Settlement Offer: ${current_offer:,.2f}

INBOUND HOSPITAL MESSAGE:
\"\"\"
{hospital_message_text}
\"\"\"

Analyze this hospital response according to the JSON schema.
"""

        analysis_data = {}
        if self.api_key:
            try:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://billfixr.com",
                    "X-Title": "BillFixr AI Negotiator"
                }
                payload = {
                    "model": REASONING_MODEL,
                    "messages": [
                        {"role": "system", "content": INBOUND_ANALYSIS_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 2500
                }

                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                    if resp.status_code == 200:
                        raw = resp.json()["choices"][0]["message"]["content"].strip()
                        if "```json" in raw:
                            raw = raw.split("```json")[1].split("```")[0].strip()
                        elif "```" in raw:
                            raw = raw.split("```")[1].split("```")[0].strip()
                        analysis_data = json.loads(raw)
            except Exception as e:
                print(f"Warning: Remote response analysis failed ({e}), using heuristic engine.")

        # Heuristic fallback if API analysis is empty
        if not analysis_data or "category" not in analysis_data:
            analysis_data = self._heuristic_analyze_response(
                hospital_message_text,
                current_offer,
                current_demanded,
                patient_name,
                provider_name,
                account_number
            )

        # Map category to updated negotiation status
        cat = analysis_data.get("category", "GENERAL_INQUIRY")
        status_map = {
            "OFFER_ACCEPTED": "HOSPITAL_ACCEPTED",
            "COUNTER_OFFER": "COUNTER_OFFER_RECEIVED",
            "CHARITY_CARE_DOCS_REQUESTED": "FINANCIAL_ASSISTANCE_REQUIRED",
            "ITEMIZED_BILL_PROVIDED": "ITEMIZED_BILL_RECEIVED",
            "DISPUTE_REJECTED": "DISPUTE_ESCALATION",
            "HIPAA_AUTH_REQUESTED": "HIPAA_AUTH_PENDING",
            "GENERAL_INQUIRY": "IN_REVIEW"
        }
        new_status = status_map.get(cat, "IN_REVIEW")
        # After settlement, an itemized or revised bill is the hospital's revised bill.
        pdf = next((a for a in (attachments or []) if a["filename"].lower().endswith(".pdf")), None)
        is_revised_bill = neg.get("status") == "SETTLEMENT_AGREED" and (
            looks_like_revised_bill(hospital_message_text, cat) or pdf is not None
        )
        if is_revised_bill:
            new_status = "AWAITING_COMPLETION_FEE"
        elif neg.get("status") == "SETTLEMENT_AGREED":
            # Other messages while we wait for the revised bill must not change the settlement status.
            new_status = "SETTLEMENT_AGREED"
        analysis_data["new_status"] = new_status

        # If hospital revised the balance
        if analysis_data.get("revised_demanded_balance"):
            analysis_data["revised_balance"] = analysis_data["revised_demanded_balance"]

        # Persist inbound message to database
        msg_record = NegotiationRepository.add_message(
            negotiation_id=negotiation_id,
            direction="INBOUND",
            sender=sender_email or provider_name,
            recipient=patient_name,
            subject=subject,
            # The revised bill stays locked until the completion fee is paid, so its text is not kept in the thread.
            content_markdown="[Revised bill received. Shown after BillFixr has checked it and the completion fee is paid.]" if is_revised_bill else hospital_message_text,
            analysis=analysis_data,
            proposed_action={
                "recommended_action": analysis_data.get("recommended_action"),
                "suggested_next_offer": analysis_data.get("suggested_next_offer", current_offer),
                "drafted_reply_markdown": analysis_data.get("drafted_reply_markdown")
            },
            status="RECEIVED",
            message_id_header=inbound_message_id,
            in_reply_to_header=inbound_in_reply_to,
            references_header=inbound_references
        )

        if is_revised_bill:
            updated = await process_revised_bill(
                neg, hospital_message_text, pdf["content"] if pdf else None, pdf["filename"] if pdf else "revised_bill.pdf"
            )
            return {"message_id": msg_record["id"], "analysis": analysis_data, "negotiation": updated}

        # Autopilot answers a rejected dispute on the same thread instead of waiting for a person.
        if cat == "DISPUTE_REJECTED" and auto_pilot_enabled and neg.get("status") not in STOP_FOLLOW_UP_STATUSES:
            if autopilot_blocked(neg):
                analysis_data["held_for_review"] = True
                NegotiationRepository.update_fields(negotiation_id, status="HELD_FOR_REVIEW")
            else:
                send_dispute_rebuttal(neg)
                analysis_data["auto_pilot_executed"] = True

        # Evaluate Deal Quality for Auto-Pilot
        counter_val = analysis_data.get("hospital_counter_amount") or analysis_data.get("revised_demanded_balance")
        if counter_val is not None:
            try:
                counter_val = float(counter_val)
            except (ValueError, TypeError):
                counter_val = None

        is_great_deal = False
        accepted_figure = current_offer

        if cat == "OFFER_ACCEPTED":
            is_great_deal = True
            accepted_figure = current_offer
            analysis_data["is_great_deal"] = True
            analysis_data["deal_rating"] = "excellent"
        elif cat == "COUNTER_OFFER" and counter_val is not None and orig_balance > 0:
            savings_pct = round(((orig_balance - counter_val) / orig_balance) * 100, 1)
            dollar_savings = round(orig_balance - counter_val, 2)
            analysis_data["savings_percentage"] = savings_pct
            analysis_data["dollar_savings"] = dollar_savings

            # Criteria for Auto-Pilot Great Deal:
            # 1. Discount >= 40% (e.g. 51.4% reduction from $360 to $175)
            # 2. Or counter amount is <= 1.5x patient initial offer
            # 3. Or DeepSeek explicitly flagged is_great_deal == True
            if savings_pct >= 40.0 or counter_val <= (current_offer * 1.5) or analysis_data.get("is_great_deal") is True:
                is_great_deal = True
                accepted_figure = counter_val
                analysis_data["is_great_deal"] = True
                analysis_data["deal_rating"] = "excellent"

        # AUTONOMOUS AUTO-PILOT SETTLEMENT
        if auto_pilot_enabled and is_great_deal and neg.get("status") not in STOP_FOLLOW_UP_STATUSES:
            if autopilot_blocked(neg):
                analysis_data["held_for_review"] = True
                NegotiationRepository.update_fields(negotiation_id, status="HELD_FOR_REVIEW")
                print(f"[AUTO-PILOT HOLD] {tracking_code}: offer ${accepted_figure:,.2f} held until findings are reviewed.")
            else:
                print(f"[AUTO-PILOT] {tracking_code}: accepting ${accepted_figure:,.2f} and requesting a revised bill.")
                settle_and_request_revised_bill(neg, accepted_figure)
                analysis_data["auto_pilot_executed"] = True
                analysis_data["new_status"] = "SETTLEMENT_AGREED"

        # Return refreshed negotiation record
        updated_neg = NegotiationRepository.get_negotiation(negotiation_id)
        return {
            "message_id": msg_record["id"],
            "analysis": analysis_data,
            "negotiation": updated_neg
        }

    def _heuristic_analyze_response(
        self,
        text: str,
        current_offer: float,
        current_demanded: float,
        patient_name: str,
        provider_name: str,
        account_number: str
    ) -> Dict[str, Any]:
        """
        Fast heuristic analyzer for offline / fallback processing.
        """
        t = text.lower()
        # Look for dollar amounts: e.g. $250.00 or $1,250.00
        raw_amounts = re.findall(r"\$\s*([0-9,]+(?:\.[0-9]{2})?)", text)
        amounts = []
        for a in raw_amounts:
            try:
                amounts.append(float(a.replace(",", "")))
            except ValueError:
                pass
        
        is_rejected_or_counter = any(w in t for w in ["cannot accept", "unable to accept", "reject", "instead offer", "counter", "settlement of", "we can offer", "reduce the bill", "discount of"])
        is_accepted = (any(w in t for w in ["accept your", "we accept", "agreed", "settle for your offer", "offer has been accepted", "payment in full"]) 
                       and not any(neg in t for neg in ["cannot", "unable", "not accept"]))

        if is_accepted:
            cat = "OFFER_ACCEPTED"
            summary = "Hospital accepted the settlement offer."
            rec = "Auto-Pilot accepting offer and preparing direct provider payment instructions."
            draft = f"Thank you for confirming acceptance of our settlement offer of ${current_offer:,.2f}. Payment will be remitted directly to your billing department upon receipt of an amended zero-balance statement."
            revised_demanded = current_offer
            next_offer = current_offer
            is_great = True
            deal_rating = "excellent"
        elif any(w in t for w in ["charity", "financial assistance", "w-2", "tax return", "income verification", "sliding fee"]):
            cat = "CHARITY_CARE_DOCS_REQUESTED"
            summary = "Hospital requested documentation for Financial Assistance / Charity Care review."
            rec = "Submit W-2 and pay stubs for potential 100% write-off under the Financial Assistance Policy."
            draft = f"In response to your request, please find attached my financial verification documents to complete the Financial Assistance Policy (FAP) review for Account #{account_number}."
            revised_demanded = current_demanded
            next_offer = 0.00
            is_great = False
            deal_rating = "fair"
        elif any(w in t for w in ["remains due", "no billing error", "no error", "coded in accordance", "compliant", "unable to accept the requested reduction"]):
            # The hospital upholds its charges and offers no new figure.
            cat = "DISPUTE_REJECTED"
            summary = "Hospital rejected the dispute and demands the full balance."
            rec = "Send a rebuttal asking for the itemized bill and documentation."
            draft = None
            revised_demanded = current_demanded
            next_offer = current_offer
            is_great = False
            deal_rating = "neutral"
        elif is_rejected_or_counter:
            cat = "COUNTER_OFFER"
            candidate_counters = [amt for amt in amounts if abs(amt - current_offer) > 1.0]
            counter_val = candidate_counters[-1] if candidate_counters else (amounts[-1] if amounts else round(current_demanded * 0.70, 2))
            summary = f"Hospital countered with an offer of ${counter_val:,.2f}."
            next_offer = round((current_offer + counter_val) / 2, 2)
            
            savings_pct = round(((current_demanded - counter_val) / current_demanded) * 100, 1) if current_demanded > 0 else 0
            is_great = (savings_pct >= 40.0 or counter_val <= (current_offer * 1.5))
            deal_rating = "excellent" if is_great else "fair"

            rec = f"Hospital reduced bill to ${counter_val:,.2f} (Saving {savings_pct}%). " + ("Auto-Pilot accepts this great reduction." if is_great else f"Counter with ${next_offer:,.2f}.")
            draft = f"Thank you for your partial discount offer of ${counter_val:,.2f}. In the interest of an immediate resolution without regulatory dispute escalation, I am prepared to split the difference and remit an immediate settlement payment of ${next_offer:,.2f}."
            revised_demanded = counter_val
        elif any(w in t for w in ["itemized", "cpt", "ub-04", "charges breakdown"]):
            cat = "ITEMIZED_BILL_PROVIDED"
            summary = "Hospital acknowledged request and provided itemized line items."
            rec = "Run detailed CPT audit against newly itemized codes."
            draft = f"Thank you for providing the itemized billing documentation for Account #{account_number}. We are completing our audit and will submit our formal fee schedule adjustment request."
            revised_demanded = current_demanded
            next_offer = current_offer
            is_great = False
            deal_rating = "neutral"
        else:
            cat = "GENERAL_INQUIRY"
            summary = "Hospital acknowledged receipt of billing dispute."
            rec = "Follow up within 14 business days if no amended statement is received."
            draft = f"Thank you for confirming receipt of our dispute regarding Account #{account_number}. We look forward to your formal written determination."
            revised_demanded = current_demanded
            next_offer = current_offer
            is_great = False
            deal_rating = "neutral"

        return {
            "category": cat,
            "revised_demanded_balance": revised_demanded,
            "hospital_counter_amount": revised_demanded if cat == "COUNTER_OFFER" else None,
            "sentiment": "cooperative" if cat in ["OFFER_ACCEPTED", "COUNTER_OFFER"] else "neutral",
            "is_great_deal": is_great,
            "deal_rating": deal_rating,
            "summary": summary,
            "recommended_action": rec,
            "suggested_next_offer": next_offer,
            "drafted_reply_markdown": draft
        }
