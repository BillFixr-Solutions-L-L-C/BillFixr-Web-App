"""
Legal Dispute and Settlement Letter Generator for BillFixr.
Uses OpenRouter (DeepSeek V3 / Qwen) to generate professional, legally grounded
dispute letters and settlement offers based on audit findings.
"""

import os
import json
import re
from datetime import datetime
from typing import Dict, Any, Optional
import httpx
from dotenv import load_dotenv

from engine.audit_engine import CITATIONS, findings_for_letter
from engine.config import ADVOCATE_EMAIL

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
REASONING_MODEL = os.getenv("LETTER_MODEL", "google/gemini-2.5-flash")
FALLBACK_REASONING_MODEL = "deepseek/deepseek-chat"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

ALLOWED_CITATIONS = list(CITATIONS.values())
CITATION_PATTERN = re.compile(r"\d+\s+(?:U\.S\.C\.|CFR)\s*§\s*[0-9A-Za-z\-]+(?:\.[0-9A-Za-z\-]+)*")


def has_unknown_citation(text: str) -> bool:
    """True if the text cites a U.S.C. or CFR section that is not in the closed citation list."""
    for match in CITATION_PATTERN.finditer(text):
        cited = " ".join(match.group(0).split())
        if not any(cited in allowed for allowed in ALLOWED_CITATIONS):
            return True
    return False

LETTER_SYSTEM_PROMPT = """You are an experienced Healthcare Patient Financial Advocate and Legal Billing Negotiator.
Your goal is to draft an executive-grade, formal Medical Bill Dispute and Settlement Demand Letter on behalf of a patient, formatted exactly as an official legal document to be reviewed by the hospital's Billing Dispute Department, Chief Financial Officer, and Legal Counsel.

Strict Formatting & Presentation Standards:
- Do NOT use generic bracket placeholders (e.g. do NOT output "[Your Address]", "[City, State, ZIP]", "[Email Address]", "[Phone Number]", or "[Date]"). Always use the concrete patient, account, provider, and date information provided.
- Letterhead Structure:
  Format the top of the letter cleanly:
  DATE: {Date}
  TO: Billing Dispute & Resolution Department
  FACILITY: {Provider Name}
  PATIENT: {Patient Name}
  ACCOUNT / INVOICE NUMBER: {Account Number}
  REFERENCE: BFX-DISPUTE-{Account Number}

  SUBJECT: FORMAL NOTICE OF DISPUTED MEDICAL CHARGES, STATUTORY AUDIT & BINDING SETTLEMENT DEMAND
- Statutory Stay Requirement:
  Assert immediate suspension of all collection efforts, interest accrual, and credit bureau reporting under the Fair Debt Collection Practices Act (15 U.S.C. § 1692g / FDCPA § 809) and IRS Section 501(r)(6).
- Itemized Disputed Charges Table:
  Format the disputed charges in a clean Markdown table with separate lines for every row:
  | Dispute Category & Reason | Disputed Amount | Statutory / Legal Authority | Demanded Remedy |
  |---|---|---|---|
  Ensure each row is on its own newline with valid pipes.
- Binding Settlement Offer Terms:
  Present the formal settlement offer with explicit terms:
  1. Full and final payment of ${Settlement Amount}.
  2. Condition: Hospital must execute and deliver a written Zero-Balance Satisfaction Letter confirming $0.00 patient balance.
  3. Payment remittance within fourteen (14) business days of written agreement.
  4. Explicit waiver of negative credit reporting.
- Compliance & Statutory Timelines:
  State a 30-day statutory response requirement. Request itemized UB-04 / CMS-1500 and certified clinical documentation if the hospital rejects the deduction.
- Formal closing:
  Sign off as:
  Respectfully submitted,
  **BillFixr Patient Financial Advocacy**
  Authorized Representative on behalf of: {Patient Name}
  Account #{Account Number} • Case Reference: BFX-DISPUTE-{Account Number}
  Advocate: __ADVOCATE_EMAIL__
"""

LETTER_SYSTEM_PROMPT = LETTER_SYSTEM_PROMPT.replace("__ADVOCATE_EMAIL__", ADVOCATE_EMAIL)

class LetterGenerator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENROUTER_API_KEY
        if not self.api_key:
            load_dotenv(override=True)
            self.api_key = os.getenv("OPENROUTER_API_KEY", "")

    def build_first_letter(self, audit_result: Dict[str, Any], settlement_offer: float) -> str:
        """
        The first dispute letter. The server builds it from high-confidence findings and approved citations.
        The browser's text is never used to send a letter.
        """
        issues = findings_for_letter(audit_result.get("issues", []))
        total_billed = float(audit_result.get("total_billed", 0.0) or 0.0)
        patient_due = float(audit_result.get("patient_due", total_billed) or total_billed)
        letter = self._generate_fallback_letter(
            patient_name=audit_result.get("patient_name", "Patient"),
            provider_name=audit_result.get("provider_name", "Healthcare Provider"),
            account_number=audit_result.get("account_number", "N/A"),
            total_billed=total_billed,
            patient_due=patient_due,
            issues=issues,
            settlement_offer=settlement_offer,
            custom_notes="",
        )
        if has_unknown_citation(letter):
            raise ValueError("The dispute letter cites an authority outside the approved list.")
        return letter

    async def generate_letter(
        self,
        audit_result: Dict[str, Any],
        settlement_offer: float,
        strategy: str = "fair_market",
        custom_notes: str = ""
    ) -> Dict[str, Any]:
        """
        Generates formal negotiation letter via OpenRouter.
        Falls back to comprehensive rule-based template if API is offline.
        """
        provider_name = audit_result.get("provider_name", "Hospital Billing Department")
        patient_name = audit_result.get("patient_name", "Patient")
        account_number = audit_result.get("account_number", "N/A")
        total_billed = float(audit_result.get("total_billed", 0.0) or 0.0)
        patient_due = float(audit_result.get("patient_due", total_billed) or total_billed)
        issues = findings_for_letter(audit_result.get("issues", []))

        # Build prompt
        issues_summary = []
        for i, iss in enumerate(issues, 1):
            issues_summary.append(
                f"{i}. [{iss.get('severity', 'HIGH').upper()}] {iss.get('title')}: "
                f"Disputed amount: ${iss.get('disputed_amount', 0):,.2f}. "
                f"Reason: {iss.get('description')} "
                f"Authority: {iss.get('statute', 'Standard Billing Correctness')}"
            )
        issues_text = "\n".join(issues_summary) if issues_summary else "General fair-market fee negotiation."

        current_date_str = datetime.now().strftime("%B %d, %Y")
        ref_id = f"BFX-DISPUTE-{account_number}"
        allowed_list_text = "\n".join(f"  - {c}" for c in ALLOWED_CITATIONS)

        user_prompt = f"""
Generate an executive-grade Formal Medical Bill Dispute & Settlement Demand Letter with the following exact audit dossier:

Date: {current_date_str}
Patient Name: {patient_name}
Healthcare Provider / Organization: {provider_name}
Patient Account / Invoice #: {account_number}
Formal Reference: {ref_id}
Original Billed Charges: ${total_billed:,.2f}
Current Balance Demanded from Patient: ${patient_due:,.2f}

Itemized Audit Findings ({len(issues)} Disputed Items):
{issues_text}

Binding Settlement Offer Amount: ${settlement_offer:,.2f}
Negotiation Posture: {strategy.upper()}
Patient Context / Hardship: {custom_notes if custom_notes else 'Statutory Section 330 sliding fee adjustment & fair-market settlement'}

CRITICAL INSTRUCTIONS:
- NEVER use generic placeholders like [Your Address] or [Date].
- Include the exact header: Date, To (Billing Dispute & Resolution Department), Patient, Account Number, Reference #{ref_id}.
- Present disputed charges in a clean Markdown table where every row is on its own line:
| Dispute Category & Reason | Disputed Amount | Statutory / Legal Authority | Demanded Remedy |
|---|---|---|---|
- Include the formal zero-balance satisfaction condition and 14-day payment window.
- Ensure the letter looks like an authentic, high-stakes formal legal packet received by hospital administration.
- Cite only these authorities, written exactly as shown. Do not cite any other statute, regulation, or guideline:
{allowed_list_text}
- Describe the findings as billing items to verify, not as proven fraud or overcharging.
"""

        # If OpenRouter key is present, invoke DeepSeek V3 for tailored generation
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
                        {"role": "system", "content": LETTER_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2500
                }

                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                    if resp.status_code == 200:
                        letter_markdown = resp.json()["choices"][0]["message"]["content"].strip()
                        if has_unknown_citation(letter_markdown):
                            print("Warning: letter cited an authority outside the closed list; using the deterministic template.")
                        else:
                            return {
                                "model_used": REASONING_MODEL,
                                "letter_markdown": letter_markdown,
                                "settlement_offer": settlement_offer,
                                "disputed_amount": audit_result.get("flagged_amount", 0.0),
                                "estimated_savings": max(0.0, patient_due - settlement_offer)
                            }
            except Exception as e:
                # If network or API fails, fallback to template instantly
                print(f"Warning: Remote letter generation failed ({e}), falling back to internal generator.")

        # High-quality fallback generator
        letter_markdown = self._generate_fallback_letter(
            patient_name=patient_name,
            provider_name=provider_name,
            account_number=account_number,
            total_billed=total_billed,
            patient_due=patient_due,
            issues=issues,
            settlement_offer=settlement_offer,
            custom_notes=custom_notes
        )

        return {
            "model_used": "billfixr-deterministic-engine",
            "letter_markdown": letter_markdown,
            "settlement_offer": settlement_offer,
            "disputed_amount": audit_result.get("flagged_amount", 0.0),
            "estimated_savings": max(0.0, patient_due - settlement_offer)
        }

    def _generate_fallback_letter(
        self,
        patient_name: str,
        provider_name: str,
        account_number: str,
        total_billed: float,
        patient_due: float,
        issues: list,
        settlement_offer: float,
        custom_notes: str
    ) -> str:
        """
        Structured legal dispute letter template.
        """
        current_date = datetime.now().strftime("%B %d, %Y")
        ref_id = f"BFX-DISPUTE-{account_number}"

        table_rows = []
        for iss in issues:
            cat = iss.get('title', 'Billing Flaw')
            amt = f"-${iss.get('disputed_amount', 0):,.2f}"
            auth = iss.get('statute', 'CMS / HRSA Section 330 Guidelines')
            rem = iss.get('remedy') or iss.get('recommendation', 'Deduct disputed charge')
            table_rows.append(f"| {cat} | {amt} | {auth} | {rem} |")
        
        # No verified findings: ask for the itemized statement rather than inventing a dollar figure.
        table_content = "\n".join(table_rows) if table_rows else f"| Request for itemized statement and fee review | To be confirmed | {CITATIONS['itemized_statement']} | Provide an itemized statement and a review of the charges |"

        notes_section = f"\n**Patient Circumstances / Context:**\n{custom_notes}\n" if custom_notes else ""

        return f"""# FORMAL NOTICE OF MEDICAL BILL DISPUTE & SETTLEMENT OFFER

**DATE:** {current_date}  
**TO:** Billing Dispute & Resolution Department  
**FACILITY:** {provider_name}  
**PATIENT NAME:** {patient_name}  
**ACCOUNT / INVOICE NUMBER:** {account_number}  
**REFERENCE:** {ref_id}  
**ORIGINAL BILLED AMOUNT:** ${total_billed:,.2f}  
**CURRENT BALANCE DEMANDED:** ${patient_due:,.2f}  

---

### RE: Formal Notice of Disputed Account #{account_number} | Billing Dispute & Settlement Offer

Dear Patient Financial Services & Dispute Resolution Team,

I am writing to formally dispute the statement balance demanded on Account #{account_number} under federal billing standards, CMS National Correct Coding Initiative (NCCI) guidelines, HRSA Health Center Compliance Manual Section 330 rules, and applicable patient protection statutes. 

A line-by-line review of this statement identified billing items that should be verified. We ask that you place this account into **Dispute Status** and pause all collection actions, interest accrual, and credit reporting while this dispute is under review.

---

## BILLING ITEMS TO VERIFY

| Dispute Category & Reason | Disputed Amount | Statutory / Legal Authority | Demanded Remedy |
|---|---|---|---|
{table_content}
{notes_section}

---

## FORMAL BINDING SETTLEMENT OFFER & ZERO-BALANCE TERMS

While I reserve all statutory rights to file formal complaints with the Centers for Medicare & Medicaid Services (CMS) and the Health Resources and Services Administration (HRSA) regarding these billing practices, I propose resolving this balance expeditiously on the following binding terms:

In full and final satisfaction of Account #{account_number}, I offer a **one-time lump-sum settlement payment of ${settlement_offer:,.2f}** (representing fair market value for legitimately non-disputed services).

### Binding Terms:
1. **Zero-Balance Satisfaction:** Acceptance of this settlement payment constitutes complete accord and satisfaction, resulting in a zero ($0.00) remaining balance.
2. **Written Confirmation:** The facility shall execute and deliver a written **Zero-Balance Satisfaction Letter** confirming closure of this balance.
3. **Payment Window:** Upon receipt of your written agreement or an amended statement reflecting this settlement figure, payment will be remitted within **fourteen (14) business days**.
4. **Credit Reporting Protection:** The facility guarantees that no adverse marks, delinquencies, or derogatory notes shall be transmitted to consumer credit bureaus regarding this account.

Please provide your formal written response within **thirty (30) days** of receipt. If you reject this settlement, please provide a certified UB-04 / CMS-1500 form and physician documentation substantiating each disputed line item.

Respectfully submitted,

**BillFixr Patient Financial Advocacy**  
Authorized Representative on behalf of: **{patient_name}**  
Account #{account_number} &bull; Case Reference: {ref_id}  
Advocate: {ADVOCATE_EMAIL}
"""
