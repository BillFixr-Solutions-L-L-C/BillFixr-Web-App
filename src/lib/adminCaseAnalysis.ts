// Step 7: the real shape `cases.admin_analysis` will hold once the
// OCR/AI-negotiation workstream populates it. Always null today — kept as
// the fallback so nothing visibly changes until real data exists.
export type AdminCaseAnalysis = {
  ocrDataExtraction: { label: string; value: string }[];
  riskAssessment: { level: string; label: string; value: string }[];
  negotiationTimeline: { title: string; subtitle?: string; date: string }[];
  replyDrafts: string[];
};

export const MOCK_ADMIN_CASE_ANALYSIS: AdminCaseAnalysis = {
  ocrDataExtraction: [
    { label: "Key Field", value: "Client Hugg" },
    { label: "Case ID", value: "5673" },
    { label: "Case Data", value: "Case 5673" },
    { label: "OCR Data Value", value: "$85.00" },
  ],
  riskAssessment: [
    { level: "High", label: "Identified Issues", value: "Risk-60%" },
    { level: "Medium", label: "Identified Issues", value: "30-60%" },
    { level: "Low", label: "Povalies Confidence", value: "60%" },
  ],
  negotiationTimeline: [
    { title: "Negotiation Letter Sent", subtitle: "Negotiation Letter Sent", date: "Aug 17, 2026" },
    { title: "Client Reply Received", date: "Aug 17, 2026" },
    { title: "Negotiation Letter Sent", subtitle: "Negotiation Letter Sent", date: "Aug 17, 2026" },
  ],
  replyDrafts: [
    "Reply, response to Clinton Joe Reply, response to...",
    "Reply, response to Clinton Joe Reply, response to...",
  ],
};
