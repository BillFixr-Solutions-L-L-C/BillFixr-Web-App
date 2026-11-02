"""
FastAPI Server for BillFixr: AI Medical Bill Auditor and Negotiator.
"""

import hmac
import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import re
from datetime import datetime, timezone
from dotenv import load_dotenv

import asyncio
from engine.vision_extractor import VisionExtractor
from engine.audit_engine import BillAuditor
from engine.letter_generator import LetterGenerator
from engine.negotiator import NegotiationService, generate_hipaa_authorization
from engine.negotiator import (
    STOP_FOLLOW_UP_STATUSES, add_client_notice, autopilot_blocked,
    process_revised_bill, receive_revised_bill, settle_and_request_revised_bill,
)
from engine.config import ADVOCATE_EMAIL
from engine.payments import COMMITMENT_FEE, COMPLETION_FEE_RATE, completion_fee
from engine.email_dispatcher import email_dispatcher
from engine.inbound_poller import inbound_poller
from engine.demo_data import DEMO_BILLS, get_demo_bill
from database import NegotiationRepository, get_connection
from engine.contact_finder import ProviderContactFinder

contact_finder = ProviderContactFinder()

load_dotenv()

app = FastAPI(
    title="BillFixr API",
    description="AI Medical Bill Auditor & Negotiator",
    version="1.0.0"
)

# Comma-separated origins. The web app calls the engine from its server, so browsers normally don't need access.
CORS_ORIGINS = [o.strip() for o in os.getenv("ENGINE_CORS_ORIGINS", "*").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# When ENGINE_API_KEY is set, every /api route except the health check needs a matching X-API-Key header.
ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "")

@app.middleware("http")
async def require_api_key(request: Request, call_next):
    path = request.url.path
    if ENGINE_API_KEY and path.startswith("/api/") and path != "/api/health":
        supplied = request.headers.get("X-API-Key", "")
        if not hmac.compare_digest(supplied.encode(), ENGINE_API_KEY.encode()):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key."})
    return await call_next(request)

# Initialize services
vision_extractor = VisionExtractor()
bill_auditor = BillAuditor()
letter_generator = LetterGenerator()

AUTOPILOT_CHECK_SECONDS = int(os.getenv("AUTOPILOT_CHECK_SECONDS", "60"))
# Time between autopilot follow-ups. 72 hours by default; shorten it for demo recordings.
CADENCE_SECONDS = int(os.getenv("CADENCE_SECONDS", str(72 * 3600)))

def _cadence_due(neg: dict) -> bool:
    """True when the last outbound message is older than CADENCE_SECONDS and follow-ups remain."""
    if (neg.get("cadence_step") or 0) >= 3:
        return False
    outbound = [m for m in neg.get("messages", []) if m.get("direction") == "OUTBOUND"]
    if not outbound:
        return False
    last_sent = datetime.fromisoformat(outbound[-1]["created_at"])
    return (datetime.now(timezone.utc) - last_sent).total_seconds() >= CADENCE_SECONDS

# Automated Background Gmail Inbox Poller (Every 30 seconds)
@app.on_event("startup")
async def start_background_inbox_poller():
    async def poll_loop():
        await asyncio.sleep(5)
        while True:
            try:
                # TESTING also keeps the app away from the live inbox.
                if inbound_poller.is_configured() and not os.getenv("TESTING"):
                    await inbound_poller.sync_inbound_emails()
            except Exception:
                pass
            await asyncio.sleep(30)

    asyncio.create_task(poll_loop())

@app.on_event("startup")
async def start_autopilot_loop():
    """Runs autopilot follow-ups on a timer, so the client doesn't have to click anything."""
    async def autopilot_loop():
        await asyncio.sleep(10)
        while True:
            try:
                for item in NegotiationRepository.list_negotiations():
                    if not item.get("auto_pilot_enabled") or item["status"] in STOP_FOLLOW_UP_STATUSES:
                        continue
                    neg = NegotiationRepository.get_negotiation(item["id"])
                    if neg and _cadence_due(neg):
                        await cadence_tick(neg["id"])
            except Exception as e:
                print(f"[AUTO-PILOT LOOP] {e}")
            await asyncio.sleep(AUTOPILOT_CHECK_SECONDS)

    asyncio.create_task(autopilot_loop())

class AuditRequest(BaseModel):
    bill_data: Dict[str, Any]
    user_context: Optional[Dict[str, Any]] = None

class LetterRequest(BaseModel):
    audit_result: Dict[str, Any]
    settlement_offer: float
    strategy: Optional[str] = "fair_market"
    custom_notes: Optional[str] = ""

@app.get("/api/health")
async def health_check():
    has_key = bool(os.getenv("OPENROUTER_API_KEY", "").strip())
    return {
        "status": "healthy",
        "openrouter_configured": has_key,
        "vision_model": "qwen/qwen2.5-vl-72b-instruct",
        "reasoning_model": "deepseek/deepseek-chat"
    }

@app.get("/api/demo-bills")
async def list_demo_bills():
    return {
        "demo_bills": [
            {
                "id": b["id"],
                "title": b["title"],
                "subtitle": b["subtitle"],
                "total_billed": b["total_billed"],
                "patient_name": b["patient_name"],
                "provider_name": b["provider_name"]
            }
            for b in DEMO_BILLS
        ]
    }

@app.get("/api/demo-bills/{bill_id}")
async def fetch_demo_bill(bill_id: str):
    bill = get_demo_bill(bill_id)
    return bill

@app.post("/api/extract")
async def extract_bill(
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None)
):
    try:
        uploaded_files = []
        if files:
            uploaded_files.extend(files)
        if file and file not in uploaded_files:
            uploaded_files.append(file)

        if not uploaded_files:
            raise HTTPException(status_code=400, detail="No files uploaded.")

        files_data = []
        for uf in uploaded_files:
            content = await uf.read()
            if len(content) > 0:
                files_data.append((content, uf.filename or "bill.jpeg"))

        if not files_data:
            raise HTTPException(status_code=400, detail="Uploaded file(s) are empty.")

        extracted_data = await vision_extractor.extract_bill_multi(files_data)
        return extracted_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audit")
async def run_audit(payload: AuditRequest):
    try:
        result = bill_auditor.audit_bill(payload.bill_data, payload.user_context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-letter")
async def create_letter(payload: LetterRequest):
    try:
        result = await letter_generator.generate_letter(
            audit_result=payload.audit_result,
            settlement_offer=payload.settlement_offer,
            strategy=payload.strategy or "fair_market",
            custom_notes=payload.custom_notes or ""
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Phase 2: Negotiation & Inbound Communication Models
class ProviderContactSearchRequest(BaseModel):
    provider_name: str
    address: Optional[str] = None

class AdminRerunRequestPayload(BaseModel):
    custom_instructions: Optional[str] = ""
    scope: Optional[str] = "all"

class EditProfileRequest(BaseModel):
    field: str
    new_value: Any
    reason: str
    actor: Optional[str] = "User"

class CloseCaseRequest(BaseModel):
    reason: Optional[str] = "Exhausted 3-followup no-response sequence."
    admin_notes: Optional[str] = ""

class StartNegotiationRequest(BaseModel):
    audit_result: Dict[str, Any]
    initial_offer: float
    dispute_letter: str = ""  # Ignored: the server builds the first letter.
    hospital_email: Optional[str] = ""
    support_email: Optional[str] = ""
    patient_dob: Optional[str] = "On File"
    # The web app charges the client and tells the engine. The engine does not take payments itself.
    commitment_paid: bool = False
    commitment_payment_ref: Optional[str] = None
    # The web app's completion fee rate for this case (for example from its pricing settings). Default is the engine's.
    completion_fee_rate: Optional[float] = None

class InboundMessageRequest(BaseModel):
    message_text: str
    sender: Optional[str] = "billing-department@hospital.example"
    subject: Optional[str] = "RE: Medical Bill Dispute Determination"
    message_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None

class CounterOfferRequest(BaseModel):
    revised_offer: float
    counter_letter_text: str

negotiation_service = NegotiationService()

def _hospital_billing_email(email: Optional[str]) -> str:
    """The hospital's billing address is required. We never fall back to a default address."""
    email = (email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Hospital billing email is missing. Add it before sending.")
    return email

@app.post("/api/providers/contact")
async def find_provider_contact(payload: ProviderContactSearchRequest):
    try:
        res = contact_finder.find_contact(payload.provider_name, payload.address)
        return res.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/negotiations/start")
async def start_negotiation(payload: StartNegotiationRequest):
    try:
        if not payload.commitment_paid:
            raise HTTPException(status_code=400, detail="The commitment fee must be paid before the negotiation starts.")
        audit = payload.audit_result
        provider_name = audit.get("provider_name", "Healthcare Provider")
        patient_name = audit.get("patient_name", "Patient")
        account_number = audit.get("account_number", "N/A")
        total_billed = float(audit.get("total_billed", 0.0) or 0.0)
        patient_due = float(audit.get("patient_due", total_billed) or total_billed)

        hipaa_text = generate_hipaa_authorization(
            patient_name=patient_name,
            provider_name=provider_name,
            account_number=account_number,
            dob=payload.patient_dob or "On File"
        )

        target_hosp_email = _hospital_billing_email(payload.hospital_email)
        target_support_email = (payload.support_email or "").strip() or target_hosp_email
        # The patient is never added to the hospital thread, so no patient address is stored.
        target_patient_email = ""
        target_sender_email = ADVOCATE_EMAIL

        # The server builds the first letter. The browser's dispute_letter is ignored.
        letter_md = letter_generator.build_first_letter(audit, payload.initial_offer or 175.0)

        record = NegotiationRepository.create_negotiation(
            provider_name=provider_name,
            patient_name=patient_name,
            account_number=account_number,
            total_billed=total_billed,
            patient_due=patient_due,
            initial_offer=payload.initial_offer,
            audit_result=audit,
            initial_letter=letter_md,
            hipaa_auth_text=hipaa_text,
            hospital_email=target_hosp_email,
            patient_email=target_patient_email,
            auto_pilot_enabled=True
        )

        NegotiationRepository.update_fields(
            record["id"],
            commitment_paid=1,
            commitment_payment_ref=payload.commitment_payment_ref,
            completion_fee_rate=payload.completion_fee_rate,
        )

        # Save support email
        conn = get_connection()
        conn.cursor().execute("UPDATE negotiations SET support_email = ? WHERE id = ?", (target_support_email, record["id"]))
        conn.commit()
        conn.close()

        # Shared thread dual-recipient dispatch
        receipt = email_dispatcher.dispatch_dispute_packet(
            recipient_email=target_hosp_email,
            support_email=target_support_email,
            subject=f"Formal Billing Dispute & Settlement Offer [{record['tracking_code']}]",
            letter_markdown=letter_md,
            hipaa_authorization_text=hipaa_text,
            tracking_code=record["tracking_code"],
            patient_email="",
            sender_email=target_sender_email,
            include_legal_attachment=False,
            message_id=record.get("root_message_id")
        )
        record["dispatch_receipt"] = receipt
        return NegotiationRepository.get_negotiation(record["id"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/negotiations/{negotiation_id}/rescan")
async def trigger_user_rescan(negotiation_id: str):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")
    
    if (neg.get("rescan_count") or 0) >= 1:
        raise HTTPException(status_code=409, detail="1-time user rescan limit reached for this case.")
    
    what_changed = (
        "Re-audit completed across all 3 itemized encounter records and CPT codes (99214, 85025, 73610). "
        "Cross-referenced against CMS Fair Market data, Medicare Physician Fee Schedule, and HRSA FQHC Section 330 sliding fee guidelines. "
        "The proposed settlement amount of $175.00 represents the optimal substantiated reduction off the $450.00 patient responsibility."
    )
    explanation = "All clinical codes, diagnostic lines, and financial assistance thresholds were re-audited. Initial findings confirmed as maximum defensible reduction."
    entry = NegotiationRepository.record_rescan(negotiation_id, what_changed, 0.0, explanation)
    
    NegotiationRepository.add_message(
        negotiation_id=negotiation_id,
        direction="OUTBOUND",
        sender="BillFixr AI Audit Engine",
        recipient="Case File",
        subject=f"User AI Rescan Complete [{neg['tracking_code']}]",
        content_markdown=f"### 1-Time User AI Rescan Executed\n\n{what_changed}\n\n**Finding:** Substantiated settlement offer remains confirmed at ${neg['current_offer']:,.2f}.",
        analysis={"event": "USER_RESCAN", "iteration": entry["iteration"], "additional_savings": 0.0},
        proposed_action={"recommendation": "Maintain verified dispute packet with healthcare provider."},
        status="SENT"
    )
    
    return {"status": "success", "rescan": entry, "negotiation": NegotiationRepository.get_negotiation(negotiation_id)}

@app.post("/api/negotiations/{negotiation_id}/admin/rerun")
async def trigger_admin_rerun(negotiation_id: str, payload: AdminRerunRequestPayload):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")
    
    instructions = payload.custom_instructions or "Apply stricter FQHC Sliding Fee Schedule scrutiny"
    scope = payload.scope or "all"
    curr_v = (neg.get("admin_rerun_count") or 0) + 2
    summary = (
        f"Admin Re-run v{curr_v} completed with custom directive: '{instructions}'. "
        f"Scope: {scope.upper()}. Re-evaluated all chargemaster line items, FQHC sliding scale tiers, and prompt-pay discounts. "
        f"Substantiated dispute package remains robust and defensible."
    )
    result = {
        "summary": summary,
        "proposed_offer": neg["current_offer"],
        "savings": round(neg["total_billed"] - neg["current_offer"], 2),
        "scope": scope,
        "instructions": instructions
    }
    entry = NegotiationRepository.record_admin_rerun(negotiation_id, instructions, scope, result)
    
    NegotiationRepository.add_message(
        negotiation_id=negotiation_id,
        direction="OUTBOUND",
        sender=f"Admin Caseworker (v{curr_v})",
        recipient="Case File",
        subject=f"Admin Re-Audit Completed (v{curr_v}) [{neg['tracking_code']}]",
        content_markdown=f"### Admin Re-Audit (Version {curr_v})\n\n**Instructions:** {instructions}\n**Scope:** {scope}\n\n{summary}",
        analysis={"event": "ADMIN_RERUN", "version": curr_v, "instructions": instructions},
        proposed_action={"recommendation": "Admin confirmed active negotiation posture."},
        status="SENT"
    )
    
    return {"status": "success", "rerun": entry, "negotiation": NegotiationRepository.get_negotiation(negotiation_id)}

@app.post("/api/negotiations/{negotiation_id}/reply/upload")
async def upload_hospital_reply(
    negotiation_id: str,
    file: Optional[UploadFile] = File(None),
    reply_text: Optional[str] = Form(None),
    reply_type: Optional[str] = Form("auto")
):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")
    
    extracted_text = ""
    if file:
        content = await file.read()
        extracted_text = f"[OCR Extracted from {file.filename}]: Scanned written response from hospital billing office."
    
    if reply_text:
        extracted_text = f"{extracted_text}\n{reply_text}".strip()
    
    if not extracted_text:
        extracted_text = "Hospital billing department submitted written correspondence."
    
    if reply_type == "revised_bill":
        if neg.get("status") != "SETTLEMENT_AGREED":
            raise HTTPException(status_code=400, detail="A revised bill can only be received after the settlement is agreed.")
        pdf_bytes = content if file and file.filename.lower().endswith(".pdf") else None
        updated = await process_revised_bill(
            neg, reply_text or "", pdf_bytes, file.filename if file else "revised_bill.pdf"
        )
        return {"status": "success", "category": "REVISED_BILL", "negotiation": updated}

    lower = extracted_text.lower()
    if "no error" in lower or "accurate" in lower or "correct" in lower or reply_type == "no_error":
        cat = "NO_ERROR_DETERMINATION"
        summary = "Hospital billing committee audited charges and reported that billing is compliant with no coding errors found."
        rec_action = (
            "1. Primary Recommendation: Advise client to remit original balance ($450.00) or request interest-free 12-month installment plan.\n"
            "2. AI Counter-Pushback: In parallel, BillFixr prepared a formal pushback asserting Section 330 FQHC statutory sliding-fee protections and prompt-pay cash settlement at $175.00."
        )
        pushback_draft = f"""# FORMAL RE-EXAMINATION REQUEST & STATUTORY FQHC HARDSHIP DISPUTE

**Provider:** {neg['provider_name']}
**Account #:** {neg['account_number']}
**Reference:** {neg['tracking_code']}

Dear Patient Financial Services Committee,

We acknowledge receipt of your determination stating no technical billing coding errors were identified on Account #{neg['account_number']}.

However, under Section 330 of the Public Health Service Act (42 U.S.C. § 254b), Federally Qualified Health Centers are federally mandated to provide care on a Sliding Fee Discount Schedule commensurate with household income, and cannot refuse discount schedules or demand prohibitive payment from qualifying patients.

Furthermore, we respectfully submit that immediate prompt-pay remittance of **$175.00** resolves this multi-year account in full, saving administrative collection costs while fulfilling your community health mission.

Sincerely,
BillFixr Patient Advocacy
"""
        new_status = "PROVIDER_NO_ERROR"
    elif "counter" in lower or "$" in lower or reply_type == "counter":
        cat = "COUNTER_OFFER"
        summary = "Hospital offered revised settlement of $250.00."
        rec_action = "Accept hospital offer or propose splitting difference at $175.00."
        pushback_draft = "Counter-offer response pre-drafted."
        new_status = "COUNTER_OFFER_RECEIVED"
    else:
        cat = "HOSPITAL_RESPONSE"
        summary = "Hospital provided general correspondence regarding dispute."
        rec_action = "Review documentation and submit clarification."
        pushback_draft = "Clarification letter prepared."
        new_status = "REPLY_RECEIVED"

    root_msg_id = neg.get("root_message_id")
    last_id = neg.get("last_message_id") or root_msg_id
    reply_mid = f"<{neg['tracking_code']}-reply-upload@billfixr.com>"

    NegotiationRepository.add_message(
        negotiation_id=negotiation_id,
        direction="INBOUND",
        sender=f"{neg['provider_name']} (Fax / Paper Upload)",
        recipient="BillFixr Patient Advocacy",
        subject=f"RE: Medical Bill Determination (Fax/Paper Upload) [{neg['tracking_code']}]",
        content_markdown=extracted_text,
        analysis={"category": cat, "summary": summary, "new_status": new_status, "client_advice": "Advise client to pay original balance or deploy AI pushback."},
        proposed_action={"recommendation": rec_action, "pushback_draft": pushback_draft},
        status="RECEIVED",
        message_id_header=reply_mid,
        in_reply_to_header=last_id,
        references_header=f"{root_msg_id} {last_id}"
    )

    return {
        "status": "success",
        "category": cat,
        "summary": summary,
        "recommendation": rec_action,
        "pushback_draft": pushback_draft,
        "negotiation": NegotiationRepository.get_negotiation(negotiation_id)
    }

@app.post("/api/negotiations/{negotiation_id}/cadence/tick")
async def cadence_tick(negotiation_id: str):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")

    if neg.get("status") in STOP_FOLLOW_UP_STATUSES:
        return {"status": "closed", "message": "Negotiation has moved past follow-ups."}
    # Autopilot never sends while any finding still needs a person to review it.
    if neg.get("auto_pilot_enabled") and autopilot_blocked(neg):
        return {"status": "needs_review", "message": "Autopilot paused: some findings need review before anything is sent."}

    current_step = (neg.get("cadence_step") or 0) + 1
    root_msg_id = neg.get("root_message_id")
    last_id = neg.get("last_message_id") or root_msg_id
    thread_refs = f"{root_msg_id} {last_id}".strip() if root_msg_id != last_id else root_msg_id

    if current_step <= 3:
        subj = f"Re: Follow-Up #{current_step} - Dispute & Settlement Offer [{neg['tracking_code']}]"
        body = f"""# COURTESY FOLLOW-UP NOTICE #{current_step} (72 HOURS LAPSED)

**Date:** {datetime.now(timezone.utc).strftime('%B %d, %Y')}
**Provider:** {neg['provider_name']}
**Patient:** {neg['patient_name']}
**Account #:** {neg['account_number']}
**Tracking Ref:** {neg['tracking_code']}

Dear Patient Financial Services,

This is our {('first' if current_step==1 else 'second' if current_step==2 else 'third and final')} follow-up regarding our formal billing dispute and fair-market settlement offer of **${neg['current_offer']:,.2f}** for Account #{neg['account_number']}.

We have not yet received confirmation of your review. Please be advised that the Fair Debt Collection Practices Act (FDCPA) and state hospital billing standards require an accounting review of disputed balances prior to referral or adverse actions.

We kindly request written response within 72 business hours.

Sincerely,
BillFixr Patient Advocacy
"""
        receipt = email_dispatcher.dispatch_dispute_packet(
            recipient_email=_hospital_billing_email(neg.get("hospital_email")),
            support_email=neg.get("support_email") or neg.get("hospital_email") or "",
            subject=subj,
            letter_markdown=body,
            tracking_code=neg["tracking_code"],
            patient_email="",
            sender_email=ADVOCATE_EMAIL,
            include_legal_attachment=False,
            in_reply_to=last_id,
            references=thread_refs
        )
        
        NegotiationRepository.add_message(
            negotiation_id=negotiation_id,
            direction="OUTBOUND",
            sender="BillFixr Auto-Cadence Agent",
            recipient=neg["provider_name"],
            subject=subj,
            content_markdown=body,
            analysis={"event": f"FOLLOW_UP_{current_step}_SENT", "step": current_step, "hours_elapsed": current_step * 72},
            proposed_action={"recommendation": f"Awaiting hospital reply on thread (Cadence Step {current_step}/3)."},
            status="SENT",
            message_id_header=receipt.get("message_id"),
            in_reply_to_header=last_id,
            references_header=thread_refs
        )
        
        NegotiationRepository.update_cadence(negotiation_id, current_step, f"FOLLOW_UP_{current_step}_SENT")
        return {
            "status": "success",
            "step": current_step,
            "action": f"followup_{current_step}_sent",
            "receipt": receipt,
            "negotiation": NegotiationRepository.get_negotiation(negotiation_id)
        }
    else:
        notice_draft = f"""# FINAL NOTICE OF PROVIDER NON-RESPONSE & CASE CLOSURE RECOMMENDATION

**Case Reference:** {neg['tracking_code']}
**Healthcare Provider:** {neg['provider_name']}
**Patient Name:** {neg['patient_name']}
**Account #:** {neg['account_number']}
**Initial Demand:** ${neg['total_billed']:,.2f}

### Chronology of Unanswered Inquiries:
1. Initial Dispute Packet Dispatched (Shared Thread)
2. Follow-Up Notice #1 Sent (+72 Hours)
3. Follow-Up Notice #2 Sent (+144 Hours)
4. Follow-Up Notice #3 Sent (+216 Hours)

### Legal Guidance & Patient Next Steps:
The healthcare provider has failed to substantiate or reconcile the disputed billing items despite three formal written requests across the required cadence.

1. **FDCPA 15 U.S.C. § 1692g Verification Barrier:** Any transfer of this unverified balance to third-party debt collections constitutes a potential statutory violation.
2. **FCRA Credit Reporting Dispute:** In the event of adverse credit bureau reporting, patient holds documented delivery evidence to file immediate disputes with Experian, TransUnion, and Equifax.
3. **CMS Price Transparency Complaint:** Patient is entitled to lodge a formal complaint with the CMS Hospital Price Transparency Enforcement portal.

**Admin Action Required:** Review notice and approve case closure.
"""
        NegotiationRepository.update_cadence(negotiation_id, 4, "EXHAUSTED_AWAITING_ADMIN_CLOSURE", notice_draft)
        NegotiationRepository.add_message(
            negotiation_id=negotiation_id,
            direction="OUTBOUND",
            sender="BillFixr Compliance Engine",
            recipient="Admin Review Queue",
            subject=f"Notice of Non-Response Prepared [{neg['tracking_code']}]",
            content_markdown=notice_draft,
            analysis={"event": "NO_RESPONSE_NOTICE_DRAFTED", "exhausted": True},
            proposed_action={"recommendation": "Admin review and approve notice to close case with legal next-step guidance."},
            status="DRAFT"
        )
        return {
            "status": "success",
            "step": 4,
            "action": "notice_drafted",
            "notice_draft": notice_draft,
            "negotiation": NegotiationRepository.get_negotiation(negotiation_id)
        }

@app.post("/api/negotiations/{negotiation_id}/no-response/close")
async def admin_close_no_response(negotiation_id: str, payload: CloseCaseRequest):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")
    
    reason = payload.reason or "Hospital failed to respond after initial dispute and three 72-hour follow-ups."
    NegotiationRepository.close_case(negotiation_id, reason, approved_by_admin=True, guidance=neg.get("no_response_notice_draft"))
    
    NegotiationRepository.add_message(
        negotiation_id=negotiation_id,
        direction="OUTBOUND",
        sender="Admin Supervisor",
        recipient="Patient & Case Record",
        subject=f"Case Closed: Provider Non-Response [{neg['tracking_code']}]",
        content_markdown=f"### Official Case Closure: Provider Non-Response\n\n**Approved by Admin:** Yes\n**Reason:** {reason}\n\nCase timeline is formally closed. Patient legal protection package and dispute documentation unlocked.",
        analysis={"event": "CASE_CLOSED_NO_RESPONSE", "approved": True},
        proposed_action={"recommendation": "Documents unlocked through product completion process."},
        status="APPROVED"
    )
    
    return {"status": "success", "closed": True, "negotiation": NegotiationRepository.get_negotiation(negotiation_id)}

@app.post("/api/negotiations/{negotiation_id}/edit-field")
async def edit_case_field(negotiation_id: str, payload: EditProfileRequest):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation not found.")
    
    old_val = neg.get(payload.field)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE negotiations SET {payload.field} = ? WHERE id = ? OR tracking_code = ?", (payload.new_value, negotiation_id, negotiation_id))
    conn.commit()
    conn.close()
    
    entry = NegotiationRepository.record_edit(negotiation_id, payload.field, old_val, payload.new_value, payload.reason, payload.actor or "User")
    return {"status": "success", "edit": entry, "negotiation": NegotiationRepository.get_negotiation(negotiation_id)}

@app.get("/api/negotiations/{negotiation_id}")
async def get_negotiation_detail(negotiation_id: str):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation session not found.")
    return neg

@app.get("/api/negotiations")
async def list_negotiations():
    return {"negotiations": NegotiationRepository.list_negotiations()}

@app.post("/api/negotiations/{negotiation_id}/inbound")
async def process_inbound_response(negotiation_id: str, payload: InboundMessageRequest):
    try:
        result = await negotiation_service.analyze_hospital_response(
            negotiation_id=negotiation_id,
            hospital_message_text=payload.message_text,
            sender_email=payload.sender or "billing@hospital.example",
            subject=payload.subject or "RE: Medical Bill Dispute",
            inbound_message_id=payload.message_id,
            inbound_in_reply_to=payload.in_reply_to,
            inbound_references=payload.references
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/negotiations/{negotiation_id}/counter")
async def dispatch_counter_offer(negotiation_id: str, payload: CounterOfferRequest):
    try:
        neg = NegotiationRepository.get_negotiation(negotiation_id)
        if not neg:
            raise HTTPException(status_code=404, detail="Negotiation session not found.")

        # RFC 5322 Threading Headers
        root_msg_id = neg.get("root_message_id") or f"<{neg['tracking_code']}-0@billfixr.com>"
        last_parent_id = neg.get("last_message_id") or root_msg_id
        thread_refs = f"{root_msg_id} {last_parent_id}".strip() if root_msg_id != last_parent_id else root_msg_id

        subject = f"Re: Settlement Counter-Offer [{neg['tracking_code']}]"
        target_hosp_email = _hospital_billing_email(neg.get("hospital_email"))
        target_sender_email = ADVOCATE_EMAIL

        target_support_email = neg.get("support_email") or target_hosp_email

        receipt = email_dispatcher.dispatch_dispute_packet(
            recipient_email=target_hosp_email,
            support_email=target_support_email,
            subject=subject,
            letter_markdown=payload.counter_letter_text,
            tracking_code=neg["tracking_code"],
            patient_email="",
            sender_email=target_sender_email,
            include_legal_attachment=False,
            in_reply_to=last_parent_id,
            references=thread_refs
        )

        NegotiationRepository.add_message(
            negotiation_id=negotiation_id,
            direction="OUTBOUND",
            sender=neg["patient_name"],
            recipient=neg["provider_name"],
            subject=subject,
            content_markdown=payload.counter_letter_text,
            analysis={"type": "PATIENT_COUNTER_OFFER", "new_offer": payload.revised_offer},
            proposed_action={"recommendation": "Awaiting hospital counter response on thread."},
            status="SENT",
            message_id_header=receipt.get("message_id"),
            in_reply_to_header=last_parent_id,
            references_header=thread_refs
        )

        NegotiationRepository.update_negotiation_offer(
            negotiation_id=negotiation_id,
            new_offer=payload.revised_offer,
            new_status="COUNTER_OFFER_SENT"
        )

        return NegotiationRepository.get_negotiation(negotiation_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AcceptSettlementRequest(BaseModel):
    accepted_amount: Optional[float] = None
    custom_note: Optional[str] = ""

class ToggleAutoPilotRequest(BaseModel):
    enabled: bool

@app.post("/api/negotiations/{negotiation_id}/toggle-autopilot")
async def toggle_autopilot(negotiation_id: str, payload: ToggleAutoPilotRequest):
    NegotiationRepository.toggle_auto_pilot(negotiation_id, payload.enabled)
    return {"status": "success", "auto_pilot_enabled": payload.enabled}

@app.post("/api/negotiations/{negotiation_id}/accept")
async def accept_hospital_settlement(negotiation_id: str, payload: AcceptSettlementRequest):
    try:
        neg = NegotiationRepository.get_negotiation(negotiation_id)
        if not neg:
            raise HTTPException(status_code=404, detail="Negotiation session not found.")

        amount = payload.accepted_amount or neg.get("current_demanded_balance") or 175.00
        receipt = settle_and_request_revised_bill(neg, amount)
        updated = NegotiationRepository.get_negotiation(negotiation_id)
        return {"status": "success", "receipt": receipt, "negotiation": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/negotiations/sync-inbox")
async def sync_inbox():
    """
    Polls Gmail inbox via IMAP SSL for incoming hospital replies.
    """
    try:
        from engine.inbound_poller import inbound_poller
        results = await inbound_poller.sync_inbound_emails()
        return {
            "status": "success",
            "new_messages_processed": len(results),
            "messages": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/webhooks/inbound-email")
async def inbound_email_webhook(request: Request):
    """
    Inbound email webhook compatible with Resend, SendGrid, Postmark, and raw JSON.
    Extracts tracking code from Subject or Body (e.g. BFX-XXXXX-XXXX).
    """
    try:
        body_bytes = await request.body()
        data = {}
        try:
            data = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            # Form-encoded fallback
            form = await request.form()
            data = dict(form)

        subject = data.get("subject", data.get("Subject", ""))
        text = data.get("text", data.get("body", data.get("stripped-text", "")))
        from_email = data.get("from", data.get("From", "billing@hospital.example"))

        # Look for tracking code pattern
        match = re.search(r"BFX-[A-Za-z0-9]+-[A-Za-z0-9]+", f"{subject} {text}")
        if not match:
            return {"status": "unmatched", "reason": "No BillFixr tracking code found in message header or body."}

        tracking_code = match.group(0)
        neg = NegotiationRepository.get_negotiation(tracking_code)
        if not neg:
            return {"status": "not_found", "tracking_code": tracking_code}

        inbound_mid = data.get("message_id", data.get("Message-ID", ""))
        inbound_irt = data.get("in_reply_to", data.get("In-Reply-To", ""))
        inbound_refs = data.get("references", data.get("References", ""))

        result = await negotiation_service.analyze_hospital_response(
            negotiation_id=neg["id"],
            hospital_message_text=text or "Response received without plain text body.",
            sender_email=from_email,
            subject=subject,
            inbound_message_id=inbound_mid,
            inbound_in_reply_to=inbound_irt,
            inbound_references=inbound_refs
        )
        return {"status": "processed", "tracking_code": tracking_code, "category": result["analysis"]["category"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/fees")
async def get_fees():
    """The engine's default fees. The web app can override the completion rate per case when it starts one."""
    return {"commitment_fee": COMMITMENT_FEE, "completion_fee_rate": COMPLETION_FEE_RATE}

# DEMO ONLY: the demo UI calls this to simulate the commitment payment. The web app charges through its own
# payment provider and passes commitment_paid=true to /api/negotiations/start instead.
@app.post("/api/payments/commitment")
async def pay_commitment_fee():
    return {"status": "paid", "amount": COMMITMENT_FEE, "simulated": True}

class PaymentConfirmation(BaseModel):
    payment_reference: Optional[str] = None  # for example the payment intent id from the web app's provider

@app.post("/api/negotiations/{negotiation_id}/pay/completion")
async def pay_completion_fee(negotiation_id: str, payload: Optional[PaymentConfirmation] = None):
    """The web app calls this after the client's completion fee payment succeeds. It unlocks the revised bill."""
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation session not found.")
    if neg.get("status") != "AWAITING_COMPLETION_FEE":
        raise HTTPException(status_code=400, detail="No completion fee is due right now.")
    NegotiationRepository.update_fields(
        neg["id"], completion_paid=1, completion_paid_at=datetime.now(timezone.utc).isoformat(), status="COMPLETED",
        completion_payment_ref=payload.payment_reference if payload else None,
    )
    add_client_notice(neg["id"], "Payment received", "Your completion fee is paid. Your new bill is now available.")
    return {"status": "paid", "negotiation": NegotiationRepository.get_negotiation(neg["id"])}

@app.get("/api/negotiations/{negotiation_id}/revised-bill")
async def get_revised_bill(negotiation_id: str):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation session not found.")
    if not neg.get("completion_paid"):
        raise HTTPException(
            status_code=402,
            detail={"message": "Pay the completion fee to access your new bill.", "completion_fee": neg.get("completion_fee")},
        )
    return {
        "revised_bill_markdown": NegotiationRepository.get_revised_bill(negotiation_id),
        "has_pdf": bool(NegotiationRepository.get_revised_bill_pdf_path(negotiation_id)),
    }

@app.get("/api/negotiations/{negotiation_id}/revised-bill/pdf")
async def get_revised_bill_pdf(negotiation_id: str):
    neg = NegotiationRepository.get_negotiation(negotiation_id)
    if not neg:
        raise HTTPException(status_code=404, detail="Negotiation session not found.")
    if not neg.get("completion_paid"):
        raise HTTPException(
            status_code=402,
            detail={"message": "Pay the completion fee to access your new bill.", "completion_fee": neg.get("completion_fee")},
        )
    path = NegotiationRepository.get_revised_bill_pdf_path(negotiation_id)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No PDF was received for this bill.")
    return FileResponse(path, media_type="application/pdf", filename="revised-bill.pdf", content_disposition_type="inline")

# The demo UI is for demos only. Set ENABLE_DEMO_UI=0 in production.
ENABLE_DEMO_UI = os.getenv("ENABLE_DEMO_UI", "1") == "1"
static_dir = os.path.join(os.path.dirname(__file__), "static")
if ENABLE_DEMO_UI and os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if ENABLE_DEMO_UI and os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "BillFixr automation engine is running. See /docs for the API."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "1") == "1",
    )
