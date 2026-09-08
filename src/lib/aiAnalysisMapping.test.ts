import { describe, expect, it } from "vitest";
import { mapAdminCaseAnalysis, mapBillAnalysis, mapCaseFields } from "./aiAnalysisMapping";
import type { AiCaseAnalysis, AiDraftCommunication, AiMedicalBillExtraction } from "@/types/ai";

function money(amount: number | null) {
  return { amount, currency: "USD" };
}

const EXTRACTION: AiMedicalBillExtraction = {
  document_type: "hospital_bill",
  patient: { name: "Jordan Taylor", phone: null, email: null, address: null },
  provider: { name: "North Valley Hospital", phone: null, email: null, address: null },
  insurer: { name: null, phone: null, email: null, address: null },
  account_number: "ABC12345",
  claim_number: null,
  statement_date: "2026-08-01",
  due_date: "2026-08-31",
  date_of_service_start: "2026-07-18",
  date_of_service_end: null,
  total_charges: money(12450),
  insurance_paid: money(8000),
  adjustments: money(0),
  patient_responsibility: money(4450),
  line_items: [
    {
      description: "ER visit",
      service_code: null,
      service_date: "2026-07-18",
      quantity: 1,
      charge: money(500),
      patient_responsibility: money(100),
      confidence: 0.8,
    },
  ],
  detected_issues: [],
  missing_fields: [],
  confidence: 0.35,
};

const ANALYSIS: AiCaseAnalysis = {
  case_id: "case-1",
  document_count: 1,
  document_types: ["hospital_bill"],
  needs_human_review: true,
  confidence_score: 0.4,
  summary: "Found a possible duplicate charge and a missing adjustment.",
  financial_summary: {
    total_charges: money(12450),
    insurance_paid: money(8000),
    adjustments: money(0),
    patient_responsibility: money(4450),
    outstanding_balance: money(4450),
    document_count_with_amounts: 1,
  },
  issues: [
    { category: "duplicate_balance_suspected", severity: "warning", summary: "Two identical line items found.", evidence: [] },
    { category: "missing_adjustments", severity: "error", summary: "No adjustments applied despite insurance payment.", evidence: [] },
  ],
  savings_opportunities: [
    { category: "duplicate_balance_suspected", title: "Duplicate charge", rationale: "r", estimated_savings: money(300), confidence: 0.6, evidence: [] },
    { category: "missing_adjustments", title: "Missing adjustment", rationale: "r", estimated_savings: money(150), confidence: 0.5, evidence: [] },
  ],
  recommended_action: {
    action_type: "request_corrected_statement",
    title: "Request a corrected statement",
    rationale: "r",
    required_documents: [],
    automation_ready: false,
  },
};

const DRAFT: AiDraftCommunication = {
  subject: "Regarding your recent statement",
  recipient_type: "provider",
  body: "Dear Billing Manager, please review the attached discrepancies...",
  tone: "professional",
  send_channel: "email",
};

describe("mapCaseFields", () => {
  it("sums savings opportunities and counts issues", () => {
    const result = mapCaseFields(ANALYSIS, DRAFT);
    expect(result.errorsDetected).toBe(2);
    expect(result.savingsFound).toBe(450);
    expect(result.appealLetterText).toBe(DRAFT.body);
    expect(result.aiSummaryText).toBe(ANALYSIS.summary);
  });

  it("returns a null appeal letter when there's no draft", () => {
    const result = mapCaseFields(ANALYSIS, null);
    expect(result.appealLetterText).toBeNull();
  });
});

describe("mapBillAnalysis", () => {
  it("maps real extraction + analysis fields into the existing BillAnalysis contract", () => {
    const result = mapBillAnalysis(EXTRACTION, ANALYSIS);
    expect(result.memberName).toBe("Jordan Taylor");
    expect(result.accountNumber).toBe("ABC12345");
    expect(result.claimNumber).toBe("No claim found");
    expect(result.errorsFound).toBe(2);
    expect(result.estimatedSavings).toBe("$450.00");
    expect(result.detectedIssues).toEqual([
      "Two identical line items found.",
      "No adjustments applied despite insurance payment.",
    ]);
    expect(result.overBilled).toBe("$4,450.00");
    expect(result.adjustedCharges).toBe("$4,000.00");
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].status).toBeNull();
  });

  it("never lets adjusted charges go negative when savings exceed the balance", () => {
    const bigSavings: AiCaseAnalysis = {
      ...ANALYSIS,
      savings_opportunities: [{ ...ANALYSIS.savings_opportunities[0], estimated_savings: money(100000) }],
    };
    const result = mapBillAnalysis(EXTRACTION, bigSavings);
    expect(result.adjustedCharges).toBe("$0.00");
  });
});

describe("mapAdminCaseAnalysis", () => {
  it("maps issues into risk rows and the draft into replyDrafts", () => {
    const result = mapAdminCaseAnalysis(EXTRACTION, ANALYSIS, DRAFT);
    expect(result.riskAssessment).toHaveLength(2);
    expect(result.riskAssessment[0]).toEqual({
      level: "Warning",
      label: "Duplicate Balance Suspected",
      value: "Two identical line items found.",
    });
    expect(result.replyDrafts).toEqual([DRAFT.body]);
    expect(result.negotiationTimeline).toEqual([]);
  });

  it("leaves replyDrafts empty when there's no draft", () => {
    const result = mapAdminCaseAnalysis(EXTRACTION, ANALYSIS, null);
    expect(result.replyDrafts).toEqual([]);
  });
});
