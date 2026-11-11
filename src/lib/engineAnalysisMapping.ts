import type { AdminCaseAnalysis } from "@/lib/adminCaseAnalysis";
import type { BillAnalysis } from "@/lib/billAnalysis";
import type {
  AutomationAuditResult,
  AutomationFinding,
  EngineBillData,
} from "@/types/automation-engine";

// Turns the engine's own audit into the shapes this app stores and shows.
//
// Two problems this exists to solve, which turned out to be one problem.
//
// 1. Every bill was read twice. The information step reads it with the
//    engine (POST /api/extract, a vision model) and parks the result in
//    bill_extractions.engine_result. /api/dev/process-with-ai then looked
//    only at bill_extractions.result -- the ai-service's shape, which the
//    information step stopped writing -- found nothing, downloaded the
//    file again and read it a second time through the weaker service.
//
// 2. Three different savings figures disagreed. On the first complete run
//    through this pipeline (2026-11-11) the system simultaneously held
//    analysis_result.estimatedSavings = "$0.00", cases.savings_found = 0,
//    and an engine letter offering $1,168.12 against a $12,450 bill. The
//    first two came from the ai-service's savings_opportunities, which the
//    model left empty; the third came from the engine's audit.
//
// Sourcing the stored analysis from the same audit the negotiation is
// built on fixes both: one reading, one set of numbers. `savingsFound`
// here and the engine's own settlement offer are now two views of one
// `settlement_options`, rather than two unrelated guesses.

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not found";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const PRIORITY_BY_SEVERITY: Record<string, "High" | "Medium" | "Low"> = {
  critical: "High",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** The engine's `potential_savings`: the figure its own settlement offer
 *  is derived from, and therefore the only savings number this app should
 *  quote. */
export function engineSavings(audit: AutomationAuditResult): number {
  const value = Number(audit?.settlement_options?.potential_savings);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

function mapFindings(audit: AutomationAuditResult): NonNullable<BillAnalysis["issues"]> {
  return (audit.issues ?? []).map((finding: AutomationFinding) => ({
    category: finding.title || finding.type || "Finding",
    priority: PRIORITY_BY_SEVERITY[finding.severity] ?? "Low",
    summary: finding.description || finding.title || "",
    // The engine cites a statute or a source for each finding, which is
    // stronger evidence than the ai-service's filename echo.
    evidence: [finding.statute, finding.source, finding.cpt_code ? `CPT ${finding.cpt_code}` : ""].filter(
      (part): part is string => Boolean(part),
    ),
    // Per-finding, not a category total: the engine attributes a disputed
    // amount to each one. 0 means it flagged an issue without putting a
    // number on it, which is not the same as no issue.
    potentialSavings: finding.disputed_amount > 0 ? money(finding.disputed_amount) : null,
  }));
}

export function mapBillAnalysisFromEngine(
  billData: EngineBillData,
  audit: AutomationAuditResult,
): BillAnalysis {
  const savings = engineSavings(audit);
  const patientDue = Number(audit.patient_due ?? billData.patient_due ?? 0);
  const totalBilled = Number(audit.total_billed ?? billData.total_billed ?? 0);
  const adjusted = Math.max(0, patientDue - savings);
  const insurancePaid = Math.max(0, totalBilled - patientDue);

  return {
    analysisSummary: summarize(audit, savings),
    memberName: billData.patient_name || "Not found",
    // Neither the engine's extraction nor its audit carries an insurance
    // member id or group. Said plainly rather than invented.
    memberId: "No member ID found",
    group: "No group found",
    claimNumber: "No claim found",
    accountNumber: audit.account_number || billData.account_number || "Not found",
    amountBreakdown: [
      { label: "Total charged", current: money(totalBilled), original: money(totalBilled), difference: "$0.00" },
      { label: "Insurance paid", current: money(insurancePaid), original: money(insurancePaid), difference: "$0.00" },
      {
        label: "Patient responsibility",
        current: money(adjusted),
        original: money(patientDue),
        difference: money(savings),
      },
    ],
    lineItems: billData.line_items.map((item) => ({
      date: item.date || "Unknown date",
      description: item.description || "Line item",
      billed: money(item.charge_amount),
      insurance: "Not itemized",
      responsibility: "Not itemized",
      // The engine ties a finding to a line by cpt_code, so a flagged line
      // can say which rule caught it.
      status: findingForLine(audit, item.cpt_code),
    })),
    errorsFound: (audit.issues ?? []).length,
    estimatedSavings: money(savings),
    detectedIssues: (audit.issues ?? []).map((f) => f.title || f.description).filter(Boolean),
    issues: mapFindings(audit),
    overBilled: money(patientDue),
    adjustedCharges: money(adjusted),
  };
}

function findingForLine(audit: AutomationAuditResult, cptCode: string): string | null {
  if (!cptCode) return null;
  const hit = (audit.issues ?? []).find((f) => f.cpt_code && f.cpt_code === cptCode);
  return hit ? hit.title || hit.type : null;
}

function summarize(audit: AutomationAuditResult, savings: number): string {
  const count = (audit.issues ?? []).length;
  if (count === 0) {
    return "We reviewed this bill against the audit rules and found nothing to dispute.";
  }
  const headline = `${count} issue${count === 1 ? "" : "s"} found on this bill`;
  const worth = savings > 0 ? `, worth up to ${money(savings)}` : "";
  const risk = audit.risk_level ? ` Risk level: ${audit.risk_level}.` : "";
  return `${headline}${worth}.${risk}`.trim();
}

export function mapAdminCaseAnalysisFromEngine(
  billData: EngineBillData,
  audit: AutomationAuditResult,
  letterText: string | null,
): AdminCaseAnalysis {
  return {
    ocrDataExtraction: [
      { label: "Patient", value: billData.patient_name || "Not found" },
      { label: "Provider", value: audit.provider_name || billData.provider_name || "Not found" },
      { label: "Account Number", value: audit.account_number || billData.account_number || "Not found" },
      { label: "Statement Date", value: billData.statement_date || "Not found" },
      { label: "Total Charges", value: money(audit.total_billed ?? billData.total_billed) },
      // The engine reports an audit score rather than an extraction
      // confidence. Labelled for what it is instead of relabelled.
      { label: "Audit Score", value: String(audit.audit_score ?? "Not scored") },
    ],
    riskAssessment: (audit.issues ?? []).map((finding) => ({
      level: finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1),
      label: finding.title || finding.type,
      value: finding.description || finding.recommendation || "",
    })),
    negotiationTimeline: [],
    replyDrafts: letterText ? [letterText] : [],
  };
}

export function mapCaseFieldsFromEngine(
  audit: AutomationAuditResult,
  letterText: string | null,
): {
  errorsDetected: number;
  savingsFound: number;
  appealLetterText: string | null;
  aiSummaryText: string;
} {
  const savings = engineSavings(audit);
  return {
    errorsDetected: (audit.issues ?? []).length,
    // The same number as analysis_result.estimatedSavings and the same
    // settlement_options the engine's offer comes from.
    savingsFound: savings,
    appealLetterText: letterText,
    aiSummaryText: summarize(audit, savings),
  };
}
