import type { BillAnalysis } from "@/lib/billAnalysis";
import type { AdminCaseAnalysis } from "@/lib/adminCaseAnalysis";
import type { AiCaseAnalysis, AiDraftCommunication, AiMedicalBillExtraction, AiMoneyAmount } from "@/types/ai";

function formatMoney(money: AiMoneyAmount | null | undefined): string {
  if (!money || money.amount == null) return "Not found";
  return money.amount.toLocaleString("en-US", { style: "currency", currency: money.currency || "USD" });
}

function totalSavings(analysis: AiCaseAnalysis): number {
  return analysis.savings_opportunities.reduce((sum, s) => sum + (s.estimated_savings.amount ?? 0), 0);
}

function humanizeCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// The one field this app's jsonb contract needs that the AI extraction
// doesn't produce at all: insurance member ID / group number aren't part
// of MedicalBillExtraction. Kept as an honest "not found" string, same
// convention the original mock already used for its own missing fields
// ("No group found" / "No claim found"), rather than fabricating one.
export function mapBillAnalysis(extraction: AiMedicalBillExtraction, analysis: AiCaseAnalysis): BillAnalysis {
  const savings = totalSavings(analysis);
  const patientResponsibility = extraction.patient_responsibility.amount ?? 0;
  const adjusted = Math.max(0, patientResponsibility - savings);

  return {
    analysisSummary: analysis.summary,
    memberName: extraction.patient.name ?? "Not found",
    memberId: "No member ID found",
    group: "No group found",
    claimNumber: extraction.claim_number ?? "No claim found",
    accountNumber: extraction.account_number ?? "Not found",
    amountBreakdown: [
      { label: "Total charged", current: formatMoney(extraction.total_charges), original: formatMoney(extraction.total_charges), difference: "$0.00" },
      { label: "Insurance paid", current: formatMoney(extraction.insurance_paid), original: formatMoney(extraction.insurance_paid), difference: "$0.00" },
      { label: "Patient responsibility", current: formatMoney(extraction.patient_responsibility), original: formatMoney(extraction.patient_responsibility), difference: "$0.00" },
    ],
    lineItems: extraction.line_items.map((item) => ({
      date: item.service_date ?? "Unknown date",
      description: item.description ?? "Line item",
      billed: formatMoney(item.charge),
      insurance: "Not itemized",
      responsibility: formatMoney(item.patient_responsibility),
      status: null,
    })),
    errorsFound: analysis.issues.length,
    estimatedSavings: savings > 0 ? formatMoney({ amount: savings, currency: "USD" }) : "$0.00",
    detectedIssues: analysis.issues.map((issue) => issue.summary),
    overBilled: formatMoney(extraction.patient_responsibility),
    adjustedCharges: formatMoney({ amount: adjusted, currency: "USD" }),
  };
}

// negotiationTimeline is intentionally empty here — nothing has actually
// been sent/received yet at analysis time, that's the existing (already
// real) case-status pipeline's job once the appeal letter goes out.
export function mapAdminCaseAnalysis(
  extraction: AiMedicalBillExtraction,
  analysis: AiCaseAnalysis,
  draft: AiDraftCommunication | null,
): AdminCaseAnalysis {
  return {
    ocrDataExtraction: [
      { label: "Patient", value: extraction.patient.name ?? "Not found" },
      { label: "Provider", value: extraction.provider.name ?? "Not found" },
      { label: "Account Number", value: extraction.account_number ?? "Not found" },
      { label: "Statement Date", value: extraction.statement_date ?? "Not found" },
      { label: "Total Charges", value: formatMoney(extraction.total_charges) },
      { label: "Extraction Confidence", value: `${Math.round(extraction.confidence * 100)}%` },
    ],
    riskAssessment: analysis.issues.map((issue) => ({
      level: issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1),
      label: humanizeCategory(issue.category),
      value: issue.summary,
    })),
    negotiationTimeline: [],
    replyDrafts: draft ? [draft.body] : [],
  };
}

export function mapCaseFields(analysis: AiCaseAnalysis, draft: AiDraftCommunication | null) {
  return {
    errorsDetected: analysis.issues.length,
    savingsFound: Math.round(totalSavings(analysis) * 100) / 100,
    appealLetterText: draft?.body ?? null,
    aiSummaryText: analysis.summary,
  };
}
