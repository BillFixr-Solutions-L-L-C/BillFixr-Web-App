// The shape `cases.admin_analysis` will hold once the OCR/AI workstream
// populates it. Null on every case today.
//
// There was a MOCK_ADMIN_CASE_ANALYSIS here that the admin Case Detail
// page fell back to whenever the column was null — which is always. The
// effect was that every case showed the same invented OCR values, risk
// percentages and reply drafts ("Client Hugg", "Risk-60%", "Reply,
// response to Clinton Joe") against a real customer's real bill, with
// nothing marking them as placeholder. It is deliberately not replaced:
// each panel now says it has nothing yet, which is true and cannot be
// mistaken for a finding.
export type AdminCaseAnalysis = {
  ocrDataExtraction: { label: string; value: string }[];
  riskAssessment: { level: string; label: string; value: string }[];
  negotiationTimeline: { title: string; subtitle?: string; date: string }[];
  replyDrafts: string[];
};
