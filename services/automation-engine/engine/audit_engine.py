"""
Medical Bill Audit Engine for BillFixr.
Performs deterministic and heuristic audits on extracted medical bill line items.
Identifies:
- Duplicate billings
- Unbundling violations (NCCI edits, routine supplies, incidental monitoring)
- Upcoding risk (e.g., Level 5 ER code 99285 for non-emergent presentations)
- Chargemaster markup / Fair Market Value deviations
- No Surprises Act compliance violations
- 501(r) Charity Care qualifications

Every finding carries:
- statute: a citation taken from the closed CITATIONS list below (never free text)
- source: where the benchmark rate came from, if one was used
- confidence: "high" when the rule is structural and fully sourced,
  "needs_review" when it relies on keywords, estimates, or an unverified rate.
  Only "high" findings go into the dispute letter.
"""

import json
import os
from typing import List, Dict, Any, Optional

# Off for the demo: letters include every finding. Set AUTOPILOT_HOLD_FOR_REVIEW=1 to send only high-confidence findings
# and to hold autopilot sends while any finding needs review.
HOLD_FOR_REVIEW = os.getenv("AUTOPILOT_HOLD_FOR_REVIEW", "0") == "1"


def findings_for_letter(issues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The findings that go into the dispute letter."""
    if HOLD_FOR_REVIEW:
        return [i for i in issues if i.get("confidence") == "high"]
    return list(issues)


BENCHMARKS_PATH = os.path.join(os.path.dirname(__file__), "benchmarks.json")
with open(BENCHMARKS_PATH, encoding="utf-8") as _f:
    BENCHMARKS = json.load(_f)["procedures"]

# Closed list of citations. Findings and the LLM letter may only use these.
# The text carries over from earlier versions and still needs legal review.
CITATIONS = {
    "itemized_statement": "Patient right to itemized statement; 42 CFR § 482.13(a)(1)",
    "duplicate": "Standard billing correctness (duplicate line items)",
    "ncci_supplies": "CMS NCCI Policy Manual, Chapter 1 & Medically Unlikely Edits (MUE)",
    "ncci_pulse_ox": "CMS National Correct Coding Initiative (NCCI) PTP Edits",
    "ncci_general": "CMS NCCI General Correct Coding Policies",
    "global_surgery": "Medicare Global Surgery Guidelines (CMS Claims Processing Manual Chapter 12)",
    "em_coding": "AMA CPT Evaluation & Management Coding Guidelines",
    "price_transparency": "Hospital Price Transparency Rule (45 CFR Part 180)",
    "nsa": "Consolidated Appropriations Act 2021 (No Surprises Act, 42 U.S.C. § 300gg-111)",
    "credit_balance": "Standard medical accounting practice (credit balance reconciliation)",
    "fqhc": "Section 330 of the Public Health Service Act (42 U.S.C. § 254b)",
    "aca_preventive": "Affordable Care Act (42 U.S.C. § 300gg-13 / PHSA Section 2713)",
    "charity_501r": "Internal Revenue Code Section 501(r)(4)",
}

# Share of a 99285 charge treated as the expected reduction when recoded to a lower level.
UPCODE_ESTIMATED_REDUCTION = 0.70
# Share of the patient balance treated as disputed for the NSA, FQHC, and sliding-scale findings.
NSA_DISPUTED_SHARE = 0.50
FQHC_DISPUTED_SHARE = 0.60
SLIDING_SCALE_DISPUTED_SHARE = 0.60
# Rough 2026 HHS poverty guideline used for the charity-care estimate (approximate).
FPL_BASE = 15600
FPL_PER_EXTRA_PERSON = 5400

# Known bundling rules: {Code: {bundled_items: [...], reason: "..."}}
# "confidence" is "high" only where the bundling is structural rather than context-dependent.
BUNDLING_RULES = {
    "99070": {
        "title": "Unbundled Medical Supplies / Tray",
        "description": "Routine disposable supplies (IV tubing, catheters, sterile surgical trays, standard dressings) are bundled into the primary procedure or facility fee and cannot be separately unbundled.",
        "severity": "high",
        "confidence": "high",
        "statute": CITATIONS["ncci_supplies"],
    },
    "94760": {
        "title": "Unbundled Pulse Oximetry Monitoring",
        "description": "Non-invasive pulse oximetry is considered integral monitoring when performed during anesthesia, surgery, or emergency care and should not be billed as an independent line item.",
        "severity": "medium",
        "confidence": "needs_review",
        "statute": CITATIONS["ncci_pulse_ox"],
    },
    "99214": {
        "title": "Pre-Operative Global Surgery Period Overlap",
        "description": "Evaluation and management services performed immediately prior to or on the day of major/minor surgery are generally included in the global surgical package unless modifier -57 is appropriately justified.",
        "severity": "medium",
        "confidence": "needs_review",
        "statute": CITATIONS["global_surgery"],
    },
}


def benchmark_for(cpt: str) -> Optional[Dict[str, Any]]:
    """Returns the benchmark entry for a CPT/HCPCS code, or None if we have none."""
    return BENCHMARKS.get(cpt)


def benchmark_source(entry: Dict[str, Any]) -> str:
    year = f" ({entry['year']})" if entry.get("year") else ""
    return f"{entry['source']}{year}"


def benchmark_confidence(entry: Optional[Dict[str, Any]]) -> str:
    """A benchmark finding is only high confidence when its rate has been verified."""
    return "high" if entry and entry.get("verified") else "needs_review"


class BillAuditor:
    def __init__(self):
        pass

    def audit_bill(self, bill_data: Dict[str, Any], user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Runs complete audit against bill data.
        Returns detailed audit issues, overall risk score, fair market valuation,
        and recommended settlement target.
        """
        line_items = bill_data.get("line_items", [])
        total_billed = float(bill_data.get("total_billed", 0) or 0)
        provider_name = bill_data.get("provider_name", "Healthcare Provider")
        patient_due = float(bill_data.get("patient_due", total_billed) or total_billed)
        notes = (bill_data.get("notes") or "").lower()

        issues: List[Dict[str, Any]] = []
        flagged_amount = 0.0
        total_medicare_benchmark = 0.0

        # 1. Summary vs Itemized Check
        is_itemized = bill_data.get("is_itemized", True)
        if not is_itemized or len(line_items) == 0:
            issues.append({
                "id": "ISSUE-SUMMARY",
                "type": "summary_bill_restriction",
                "severity": "critical",
                "confidence": "high",
                "title": "Summary Bill Detected (Itemized Bill Requested)",
                "description": "This bill only shows totals by department, without CPT/HCPCS or revenue codes. You have the right to request a fully itemized UB-04 or CMS-1500 statement.",
                "disputed_amount": patient_due,
                "recommendation": "Request an itemized UB-04 or CMS-1500 statement before paying.",
                "statute": CITATIONS["itemized_statement"],
            })
            flagged_amount += patient_due

        # 2. Duplicate Detection
        seen_items = {}
        for idx, item in enumerate(line_items):
            cpt = (item.get("cpt_code") or "").strip()
            desc = (item.get("description") or "").strip().lower()
            date = item.get("date", "")
            charge = float(item.get("charge_amount", 0) or 0)

            # Key for duplicate matching
            key = f"{date}_{cpt}" if cpt else f"{date}_{desc[:20]}"

            if key in seen_items and charge > 0:
                prev_idx = seen_items[key]
                issues.append({
                    "id": f"ISSUE-DUP-{idx}",
                    "type": "duplicate_charge",
                    "severity": "critical",
                    "confidence": "high",
                    "line_id": item.get("line_id", f"L{idx+1}"),
                    "cpt_code": cpt,
                    "title": f"Possible Duplicate Charge: {item.get('description')}",
                    "description": f"The same service appears more than once on {date}, on lines {prev_idx+1} and {idx+1} (${charge:,.2f}). Please check whether this was billed twice.",
                    "disputed_amount": charge,
                    "recommendation": f"Ask the billing office to confirm or remove the duplicate ${charge:,.2f}.",
                    "remedy": f"Remove the duplicate ${charge:,.2f} charge.",
                    "statute": CITATIONS["duplicate"],
                })
                flagged_amount += charge
            else:
                seen_items[key] = idx

        # 3. Unbundling Detection
        for idx, item in enumerate(line_items):
            cpt = str(item.get("cpt_code") or "").strip()
            desc = (item.get("description") or "").lower()
            charge = float(item.get("charge_amount", 0) or 0)

            # Check unbundled supply code (99070)
            if cpt in BUNDLING_RULES:
                rule = BUNDLING_RULES[cpt]
                issues.append({
                    "id": f"ISSUE-UNBUNDLE-{idx}",
                    "type": "unbundling",
                    "severity": rule["severity"],
                    "confidence": rule["confidence"],
                    "line_id": item.get("line_id", f"L{idx+1}"),
                    "cpt_code": cpt,
                    "title": rule["title"],
                    "description": f"{rule['description']} (Billed amount: ${charge:,.2f})",
                    "disputed_amount": charge,
                    "recommendation": f"Ask why ${charge:,.2f} is billed separately from the procedure it belongs to.",
                    "remedy": f"Remove the separate ${charge:,.2f} charge, or document why it is billed apart from the procedure.",
                    "statute": rule["statute"],
                })
                flagged_amount += charge
            elif any(w in desc for w in ["start kit", "tray", "tubing", "disposable pack"]) and charge > 100:
                issues.append({
                    "id": f"ISSUE-UNBUNDLE-DESC-{idx}",
                    "type": "unbundling",
                    "severity": "high",
                    "confidence": "needs_review",
                    "line_id": item.get("line_id", f"L{idx+1}"),
                    "cpt_code": cpt or "N/A",
                    "title": f"Possible Unbundled Kit/Tray: {item.get('description')}",
                    "description": f"Routine supplies and kits (${charge:,.2f}) are often included in the procedure or facility fee.",
                    "disputed_amount": charge,
                    "recommendation": "Ask whether this supply charge should be part of the procedure fee.",
                    "statute": CITATIONS["ncci_general"],
                })
                flagged_amount += charge

        # 4. Upcoding Risk (e.g. 99285 ER Level 5)
        level_5 = benchmark_for("99285")
        level_3 = benchmark_for("99283")
        for idx, item in enumerate(line_items):
            cpt = str(item.get("cpt_code") or "").strip()
            charge = float(item.get("charge_amount", 0) or 0)
            if cpt == "99285" and level_5 and level_3:
                is_minor_sprain = any(k in notes for k in ["sprain", "twisted", "minor", "cut", "laceration", "stable", "cold", "flu"])
                severity = "critical" if is_minor_sprain else "high"
                above_level_3 = charge - level_3["rate"]
                issues.append({
                    "id": f"ISSUE-UPCODE-{idx}",
                    "type": "upcoding_risk",
                    "severity": severity,
                    "confidence": "needs_review",
                    "line_id": item.get("line_id", f"L{idx+1}"),
                    "cpt_code": cpt,
                    "title": "Possible Upcoding to Verify: CPT 99285 (Level 5 Emergency Visit)",
                    "description": f"CPT 99285 is generally used for severe, life-threatening presentations. For injuries such as sprains or minor cuts, a Level 3 or 4 visit (99283 or 99284) is often expected. The charge of ${charge:,.2f} is ${above_level_3:,.2f} above the Level 3 benchmark. Your medical record shows what level of care was given.",
                    "disputed_amount": charge * UPCODE_ESTIMATED_REDUCTION,
                    "recommendation": "Ask for the medical record and the physician's documentation supporting Level 5.",
                    "source": benchmark_source(level_3),
                    "statute": CITATIONS["em_coding"],
                })
                flagged_amount += (charge * UPCODE_ESTIMATED_REDUCTION)

        # 5. Fair Market Benchmark & Excessive Chargemaster Markup Check
        for idx, item in enumerate(line_items):
            cpt = str(item.get("cpt_code") or "").strip()
            charge = float(item.get("charge_amount", 0) or 0)
            entry = benchmark_for(cpt)
            if item.get("medicare_benchmark"):
                # A rate supplied by the bill itself is not verified by us.
                benchmark = float(item["medicare_benchmark"])
                source, confidence = "Rate listed on the bill (unverified)", "needs_review"
            elif entry:
                benchmark = entry["rate"]
                source, confidence = benchmark_source(entry), benchmark_confidence(entry)
            else:
                benchmark = 0.0
            if benchmark > 0:
                total_medicare_benchmark += benchmark
                markup_ratio = charge / benchmark
                if markup_ratio > 5.0 and charge > 100:  # More than 500% of the benchmark rate
                    issues.append({
                        "id": f"ISSUE-MARKUP-{idx}",
                        "type": "chargemaster_markup",
                        "severity": "medium",
                        "confidence": confidence,
                        "line_id": item.get("line_id", f"L{idx+1}"),
                        "cpt_code": cpt,
                        "title": f"Possible High Charge to Verify: {item.get('description')}",
                        "description": f"Billed at ${charge:,.2f}, which is {markup_ratio:.1f}x the benchmark rate of ${benchmark:,.2f} ({source}).",
                        "disputed_amount": max(0.0, charge - (benchmark * 2.0)),
                        "recommendation": f"Ask for a reduction toward 200% of the benchmark rate (${(benchmark * 2.0):,.2f}).",
                        "source": source,
                        "statute": CITATIONS["price_transparency"],
                    })

        # 6. No Surprises Act Balance Billing Flag
        if "out-of-network" in notes and any(term in notes for term in ["emergency", "in-network facility", "assistant"]):
            issues.append({
                "id": "ISSUE-NSA",
                "type": "no_surprises_act",
                "severity": "critical",
                "confidence": "needs_review",
                "title": "Possible No Surprises Act Issue (Balance Billing)",
                "description": "Under the federal No Surprises Act, out-of-network providers at an in-network facility or in emergency departments generally cannot bill you beyond your in-network cost-sharing.",
                "disputed_amount": patient_due * NSA_DISPUTED_SHARE,
                "recommendation": "Ask whether this charge is covered by No Surprises Act protections.",
                "statute": CITATIONS["nsa"],
            })

        # 7. Credit Balance / Unapplied Overpayment Check
        if any(term in notes for term in ["credit", "negative balance", "-$", "overpayment", "overpaid"]) or patient_due < 0:
            issues.append({
                "id": "ISSUE-CREDIT-BALANCE",
                "type": "unapplied_credit_balance",
                "severity": "medium",
                "confidence": "needs_review",
                "title": "Possible Unapplied Credit Balance",
                "description": "The statement mentions a credit or overpayment that may not have been applied to the balance.",
                "disputed_amount": abs(patient_due) if patient_due < 0 else 0.0,
                "recommendation": "Ask the billing office to apply any credit to your balance or refund it.",
                "statute": CITATIONS["credit_balance"],
            })

        # 8. FQHC (Federally Qualified Health Center) Sliding Fee Check
        if any(k in provider_name.lower() for k in ["comprehensive health", "community health", "fqhc", "family health center"]):
            issues.append({
                "id": "ISSUE-FQHC-SLIDING-SCALE",
                "type": "fqhc_sliding_fee_audit",
                "severity": "high",
                "confidence": "needs_review",
                "title": "Possible FQHC Sliding Fee Review",
                "description": f"{provider_name} may be a Federally Qualified Health Center (FQHC). FQHCs generally must offer a sliding fee discount based on income.",
                "disputed_amount": patient_due * FQHC_DISPUTED_SHARE,
                "recommendation": "Ask whether the sliding fee discount was applied to this account.",
                "remedy": "Re-adjudicate all line items under the FQHC Sliding Fee Discount Schedule.",
                "statute": CITATIONS["fqhc"],
            })
            flagged_amount += (patient_due * FQHC_DISPUTED_SHARE)

        # 9. ACA Preventive Care Free Coverage Check (Affordable Care Act § 2713)
        for idx, item in enumerate(line_items):
            desc = (item.get("description") or "").lower()
            cpt = str(item.get("cpt_code") or "").strip()
            charge = float(item.get("charge_amount", 0) or 0)
            if any(term in desc for term in ["preventive", "preventative", "vaccine", "immunization", "wellness", "hepatitis b", "chlamydia", "syphilis", "hiv"]) and charge > 0:
                issues.append({
                    "id": f"ISSUE-ACA-PREV-{idx}",
                    "type": "aca_preventive_protection",
                    "severity": "medium",
                    "confidence": "needs_review",
                    "line_id": item.get("line_id", f"L{idx+1}"),
                    "cpt_code": cpt,
                    "title": f"Possible Preventive Care Cost Issue: {item.get('description')}",
                    "description": "Under the ACA, many preventive services and recommended vaccines must be covered with no cost-sharing by non-grandfathered plans.",
                    "disputed_amount": charge * 0.5,
                    "recommendation": "Ask whether this preventive service was billed with the correct preventive diagnosis code.",
                    "statute": CITATIONS["aca_preventive"],
                })

        # 10. Charity Care / 501(r) Check
        fpl_percentage = None
        if user_context and "household_income" in user_context and "household_size" in user_context:
            try:
                income = float(user_context["household_income"])
                size = int(user_context["household_size"])
                base_fpl = FPL_BASE + (max(0, size - 1) * FPL_PER_EXTRA_PERSON)
                fpl_ratio = (income / base_fpl) * 100
                fpl_percentage = round(fpl_ratio, 1)

                if fpl_ratio <= 200:
                    issues.append({
                        "id": "ISSUE-CHARITY-100",
                        "type": "charity_care",
                        "severity": "high",
                        "confidence": "needs_review",
                        "title": f"Possibly Eligible for Charity Care ({fpl_percentage}% FPL)",
                        "description": f"Household income (${income:,.0f} for {size} persons) appears to be under 200% of the Federal Poverty Level. Non-profit hospitals must have a financial assistance policy for patients in this range.",
                        "disputed_amount": patient_due,
                        "recommendation": "Ask for the hospital's financial assistance application and submit proof of income.",
                        "statute": CITATIONS["charity_501r"],
                    })
                elif fpl_ratio <= 400:
                    issues.append({
                        "id": "ISSUE-CHARITY-SLIDING",
                        "type": "charity_care",
                        "severity": "medium",
                        "confidence": "needs_review",
                        "title": f"Possibly Eligible for Sliding Scale Charity Care ({fpl_percentage}% FPL)",
                        "description": "Household income appears to be between 200% and 400% of the Federal Poverty Level. Many hospital financial assistance policies offer partial reductions in this range.",
                        "disputed_amount": patient_due * SLIDING_SCALE_DISPUTED_SHARE,
                        "recommendation": "Ask for a hardship reduction under the hospital's financial assistance policy.",
                        "statute": CITATIONS["charity_501r"],
                    })
            except (TypeError, ValueError):
                pass

        # Calculate Settlement Recommendations
        # Standard FMV Settlement: 200% of Medicare benchmark + undisputed charges, or 50% cash settlement
        if total_medicare_benchmark > 0:
            medicare_fmv = total_medicare_benchmark * 2.0
            recommended_offer = round(min(medicare_fmv, patient_due * 0.40), 2)
        else:
            recommended_offer = round(patient_due * 0.35, 2)

        # Minimum aggressive offer (150% Medicare or 30% prompt pay)
        aggressive_offer = round(recommended_offer * 0.75, 2)
        moderate_offer = recommended_offer
        prompt_pay_cash_offer = round(patient_due * 0.50, 2)

        potential_savings = max(0.0, round(patient_due - recommended_offer, 2))

        # Risk score calculation (0 - 100)
        critical_count = sum(1 for i in issues if i.get("severity") == "critical")
        high_count = sum(1 for i in issues if i.get("severity") == "high")
        medium_count = sum(1 for i in issues if i.get("severity") == "medium")
        audit_score = min(100, (critical_count * 35) + (high_count * 20) + (medium_count * 10))

        return {
            "bill_id": bill_data.get("id", "uploaded-bill"),
            "provider_name": provider_name,
            "patient_name": bill_data.get("patient_name", "Patient"),
            "account_number": bill_data.get("account_number", "N/A"),
            "statement_date": bill_data.get("statement_date", "N/A"),
            "total_billed": total_billed,
            "patient_due": patient_due,
            "audit_score": audit_score,
            "risk_level": "High" if audit_score >= 50 else ("Moderate" if audit_score >= 25 else "Low"),
            "issues_count": len(issues),
            "needs_review_count": sum(1 for i in issues if i.get("confidence") != "high"),
            "flagged_amount": round(flagged_amount, 2),
            "total_medicare_benchmark": round(total_medicare_benchmark, 2),
            "settlement_options": {
                "aggressive_offer": aggressive_offer,
                "fair_market_offer": moderate_offer,
                "prompt_pay_discount_offer": prompt_pay_cash_offer,
                "potential_savings": potential_savings,
                "savings_percentage": round((potential_savings / patient_due * 100) if patient_due > 0 else 0, 1)
            },
            "issues": issues,
            "fpl_percentage": fpl_percentage
        }
