"""
Unit tests for BillFixr Audit Engine, Demo Data, and Letter Generator.
"""

import pytest
from engine.audit_engine import BillAuditor
from engine.demo_data import DEMO_BILLS, get_demo_bill
from engine.letter_generator import LetterGenerator

def test_demo_bills_exist():
    assert len(DEMO_BILLS) >= 2
    er_bill = get_demo_bill("er-metro-general")
    assert er_bill["provider_name"] == "Metro General Hospital & Trauma Center"
    assert len(er_bill["line_items"]) == 9
    assert er_bill["total_billed"] == 8640.00

def test_audit_er_bill_detects_duplicates_and_unbundling():
    auditor = BillAuditor()
    er_bill = get_demo_bill("er-metro-general")
    
    result = auditor.audit_bill(er_bill)
    
    # Assert result structure
    assert result["audit_score"] >= 50
    assert result["risk_level"] == "High"
    assert result["total_billed"] == 8640.00
    assert result["flagged_amount"] > 2000.00

    issue_types = [issue["type"] for issue in result["issues"]]
    
    # Must detect duplicate CBC
    assert "duplicate_charge" in issue_types
    dup_issue = next(i for i in result["issues"] if i["type"] == "duplicate_charge")
    assert dup_issue["cpt_code"] == "85025"
    assert dup_issue["disputed_amount"] == 280.00

    # Must detect unbundled supplies (99070 or IV kit)
    assert "unbundling" in issue_types
    unbundle_issue = next(i for i in result["issues"] if i["type"] == "unbundling")
    assert unbundle_issue["disputed_amount"] >= 390.00

    # Must detect upcoding on 99285 ER Level 5
    assert "upcoding_risk" in issue_types
    upcode_issue = next(i for i in result["issues"] if i["type"] == "upcoding_risk")
    assert upcode_issue["cpt_code"] == "99285"

def test_audit_surgery_bill_detects_unbundled_tray_and_pulse_ox():
    auditor = BillAuditor()
    ortho_bill = get_demo_bill("surgery-valley-ortho")
    
    result = auditor.audit_bill(ortho_bill)
    
    assert result["total_billed"] == 14850.00
    issue_types = [issue["type"] for issue in result["issues"]]
    
    # 99070 surgical tray unbundled
    assert "unbundling" in issue_types
    tray_issue = next(i for i in result["issues"] if i.get("cpt_code") == "99070")
    assert tray_issue["disputed_amount"] == 1250.00

    # 94760 pulse oximetry unbundled
    pulse_ox = next(i for i in result["issues"] if i.get("cpt_code") == "94760")
    assert pulse_ox["disputed_amount"] == 350.00

def test_charity_care_eligibility():
    auditor = BillAuditor()
    er_bill = get_demo_bill("er-metro-general")
    
    # Low income family of 4 ($30,000 / year is ~94% FPL)
    context = {"household_income": 30000, "household_size": 4}
    result = auditor.audit_bill(er_bill, context)
    
    issue_types = [issue["type"] for issue in result["issues"]]
    assert "charity_care" in issue_types
    charity_issue = next(i for i in result["issues"] if i["type"] == "charity_care")
    assert "Charity Care" in charity_issue["title"]
    assert charity_issue["confidence"] == "needs_review"

def test_fallback_letter_generation():
    auditor = BillAuditor()
    er_bill = get_demo_bill("er-metro-general")
    audit_res = auditor.audit_bill(er_bill)
    
    generator = LetterGenerator(api_key="mock_invalid_key_for_fallback")
    letter = generator._generate_fallback_letter(
        patient_name=audit_res["patient_name"],
        provider_name=audit_res["provider_name"],
        account_number=audit_res["account_number"],
        total_billed=audit_res["total_billed"],
        patient_due=audit_res["patient_due"],
        issues=audit_res["issues"],
        settlement_offer=1655.40,
        custom_notes="Patient is experiencing financial hardship."
    )
    
    assert "FORMAL NOTICE OF MEDICAL BILL DISPUTE" in letter
    assert "Metro General Hospital" in letter
    assert "MGH-982410-A" in letter
    assert "$1,655.40" in letter
    assert "Duplicate Charge" in letter
