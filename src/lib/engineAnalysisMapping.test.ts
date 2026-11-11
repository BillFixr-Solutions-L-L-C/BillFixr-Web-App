import { describe, expect, it } from "vitest";

import {
  engineSavings,
  mapAdminCaseAnalysisFromEngine,
  mapBillAnalysisFromEngine,
  mapCaseFieldsFromEngine,
} from "@/lib/engineAnalysisMapping";
import type { AutomationAuditResult, EngineBillData } from "@/types/automation-engine";

// The reason this mapper exists: on the first complete run through the
// pipeline (2026-11-11) the system held three savings figures that
// disagreed on the same bill --
//   analysis_result.estimatedSavings  "$0.00"
//   cases.savings_found               0
//   the engine's letter               offering $1,168.12 on a $12,450 bill
// The first two came from the ai-service's savings_opportunities, which
// the model left empty. The third came from the engine's audit. Sourcing
// the stored analysis from that same audit is what makes them one number.

const BILL: EngineBillData = {
  provider_name: "North Valley Hospital",
  patient_name: "Jordan Taylor",
  account_number: "IMG12345",
  statement_date: "2026-08-01",
  date_of_service: "2026-07-18",
  total_billed: 12450,
  patient_due: 4450,
  is_itemized: true,
  line_items: [
    { description: "ER Visit Level 5", cpt_code: "99285", date: "2026-07-18", quantity: 1, charge_amount: 2500 },
    { description: "Lab panel", cpt_code: "80053", date: "2026-07-18", quantity: 1, charge_amount: 180 },
  ],
};

const AUDIT: AutomationAuditResult = {
  provider_name: "North Valley Hospital",
  patient_name: "Jordan Taylor",
  account_number: "IMG12345",
  total_billed: 12450,
  patient_due: 4450,
  audit_score: 62,
  risk_level: "elevated",
  issues_count: 2,
  needs_review_count: 1,
  flagged_amount: 2680,
  settlement_options: {
    aggressive_offer: 1168.12,
    fair_market_offer: 1800,
    prompt_pay_discount_offer: 2100,
    potential_savings: 2650,
    savings_percentage: 59,
  },
  issues: [
    {
      id: "f1",
      type: "duplicate_charge",
      severity: "critical",
      confidence: "high",
      title: "Possible Duplicate Charge",
      description: "Code 99285 appears on lines 3 and 7.",
      disputed_amount: 2500,
      recommendation: "Request removal of the duplicate line.",
      statute: "45 CFR 147.136",
      source: "CMS",
      cpt_code: "99285",
    },
    {
      id: "f2",
      type: "fqhc_sliding_fee",
      severity: "medium",
      confidence: "needs_review",
      title: "Possible FQHC Sliding Fee Review",
      description: "The provider may be a federally qualified health center.",
      disputed_amount: 0,
      recommendation: "Ask for the sliding fee schedule.",
      statute: "42 U.S.C. 254b",
    },
  ],
};

describe("engineSavings", () => {
  it("is the engine's own potential_savings", () => {
    // The same settlement_options the engine's offer comes from.
    expect(engineSavings(AUDIT)).toBe(2650);
  });

  it("is zero, not negative or NaN, when the engine offers nothing", () => {
    const none = { ...AUDIT, settlement_options: { ...AUDIT.settlement_options, potential_savings: 0 } };
    expect(engineSavings(none)).toBe(0);
    const broken = { ...AUDIT, settlement_options: undefined } as unknown as AutomationAuditResult;
    expect(engineSavings(broken)).toBe(0);
  });
});

describe("the three figures agree", () => {
  it("the stored analysis and the case field quote the same number", () => {
    // This is the whole point. They used to be computed from different
    // sources and disagreed on a real bill.
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    const fields = mapCaseFieldsFromEngine(AUDIT, null);

    expect(fields.savingsFound).toBe(2650);
    expect(analysis.estimatedSavings).toBe("$2,650.00");
    expect(analysis.amountBreakdown[2].difference).toBe("$2,650.00");
  });

  it("and both come from the audit the negotiation is built on", () => {
    // startNegotiationForCase passes settlement_options.aggressive_offer
    // as the opening offer, off this same object.
    const fields = mapCaseFieldsFromEngine(AUDIT, null);
    expect(fields.savingsFound).toBe(AUDIT.settlement_options.potential_savings);
  });

  it("the adjusted figure is the patient's balance less those savings", () => {
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    expect(analysis.overBilled).toBe("$4,450.00");
    expect(analysis.adjustedCharges).toBe("$1,800.00"); // 4450 - 2650
  });

  it("never shows a negative balance when the savings exceed the bill", () => {
    const huge = { ...AUDIT, settlement_options: { ...AUDIT.settlement_options, potential_savings: 99999 } };
    expect(mapBillAnalysisFromEngine(BILL, huge).adjustedCharges).toBe("$0.00");
  });
});

describe("mapBillAnalysisFromEngine", () => {
  it("counts the engine's findings", () => {
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    expect(analysis.errorsFound).toBe(2);
    expect(analysis.detectedIssues).toEqual([
      "Possible Duplicate Charge",
      "Possible FQHC Sliding Fee Review",
    ]);
  });

  it("carries the statute and source as evidence", () => {
    // Stronger than the ai-service path, which echoed the filename.
    const [first] = mapBillAnalysisFromEngine(BILL, AUDIT).issues!;
    expect(first.evidence).toContain("45 CFR 147.136");
    expect(first.evidence).toContain("CMS");
    expect(first.evidence).toContain("CPT 99285");
  });

  it("attributes a disputed amount per finding, and null when there is none", () => {
    const [dup, fqhc] = mapBillAnalysisFromEngine(BILL, AUDIT).issues!;
    expect(dup.potentialSavings).toBe("$2,500.00");
    // Flagged without a number on it is not the same as no issue.
    expect(fqhc.potentialSavings).toBeNull();
  });

  it("maps severity to priority", () => {
    const [dup, fqhc] = mapBillAnalysisFromEngine(BILL, AUDIT).issues!;
    expect(dup.priority).toBe("High");
    expect(fqhc.priority).toBe("Medium");
  });

  it("marks the line a finding points at", () => {
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    expect(analysis.lineItems[0].status).toBe("Possible Duplicate Charge");
    expect(analysis.lineItems[1].status).toBeNull();
  });

  it("invents no insurance identity it was not given", () => {
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    expect(analysis.memberId).toBe("No member ID found");
    expect(analysis.group).toBe("No group found");
    expect(analysis.memberName).toBe("Jordan Taylor");
  });

  it("says so plainly when a clean bill has nothing to dispute", () => {
    const clean = {
      ...AUDIT,
      issues: [],
      settlement_options: { ...AUDIT.settlement_options, potential_savings: 0 },
    };
    const analysis = mapBillAnalysisFromEngine(BILL, clean);
    expect(analysis.errorsFound).toBe(0);
    expect(analysis.estimatedSavings).toBe("$0.00");
    expect(analysis.analysisSummary).toMatch(/nothing to dispute/i);
  });

  it("derives insurance paid from the two totals", () => {
    const analysis = mapBillAnalysisFromEngine(BILL, AUDIT);
    expect(analysis.amountBreakdown[1]).toMatchObject({ label: "Insurance paid", current: "$8,000.00" });
  });
});

describe("mapCaseFieldsFromEngine", () => {
  it("stores the letter it is given", () => {
    const fields = mapCaseFieldsFromEngine(AUDIT, "Dear Patient Financial Services…");
    expect(fields.appealLetterText).toBe("Dear Patient Financial Services…");
  });

  it("stores no letter when none was sent", () => {
    expect(mapCaseFieldsFromEngine(AUDIT, null).appealLetterText).toBeNull();
  });

  it("summarises what was found", () => {
    expect(mapCaseFieldsFromEngine(AUDIT, null).aiSummaryText).toContain("2 issues found");
  });
});

describe("mapAdminCaseAnalysisFromEngine", () => {
  it("reports the audit score as an audit score, not as a confidence", () => {
    const admin = mapAdminCaseAnalysisFromEngine(BILL, AUDIT, null);
    expect(admin.ocrDataExtraction).toContainEqual({ label: "Audit Score", value: "62" });
  });

  it("lists each finding with its severity", () => {
    const admin = mapAdminCaseAnalysisFromEngine(BILL, AUDIT, null);
    expect(admin.riskAssessment).toHaveLength(2);
    expect(admin.riskAssessment[0]).toMatchObject({ level: "Critical", label: "Possible Duplicate Charge" });
  });

  it("keeps the sent letter with the case record", () => {
    expect(mapAdminCaseAnalysisFromEngine(BILL, AUDIT, "the letter").replyDrafts).toEqual(["the letter"]);
  });
});
