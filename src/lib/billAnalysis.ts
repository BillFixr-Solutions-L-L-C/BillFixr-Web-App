// Step 7: the real shape `bills.analysis_result` will hold once the
// OCR/error-detection workstream populates it. Always null today — every
// field below is the exact content the page already showed as a hardcoded
// mock, kept as the fallback so nothing visibly changes until real data
// exists.
export type BillAnalysis = {
  analysisSummary: string;
  memberName: string;
  memberId: string;
  group: string;
  claimNumber: string;
  accountNumber: string;
  amountBreakdown: { label: string; current: string; original: string; difference: string }[];
  lineItems: {
    date: string;
    description: string;
    billed: string;
    insurance: string;
    responsibility: string;
    status: string | null;
  }[];
  errorsFound: number;
  estimatedSavings: string;
  detectedIssues: string[];
  overBilled: string;
  adjustedCharges: string;
};

export const MOCK_BILL_ANALYSIS: BillAnalysis = {
  analysisSummary:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin ultricies fringilla diam, a egestas tellus ultricies et. Maecenas nec erat non nulla commodo ultricies at eu nisl. Proin egestas, nisi a tristique commodo, libero nulla convallis felis, eget pretium tellus tortor id nisl. Aliquam a auctor nisi. Maecenas",
  memberName: "Dave J. Collins",
  memberId: "UCH-810-4474",
  group: "No group found",
  claimNumber: "No claim found",
  accountNumber: "SHDE-20982-098765",
  amountBreakdown: [
    { label: "Total charged", current: "$2,345", original: "$2,345", difference: "$2,345" },
    { label: "Insurance paid", current: "$2,345", original: "$2,345", difference: "$2,345" },
    { label: "Patient responsibility", current: "$2,345", original: "$2,345", difference: "$2,345" },
  ],
  lineItems: [
    { date: "2026-07-15", description: "ER Facility E&M Level 4 ...", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: null },
    { date: "2026-07-15", description: "ER Facility E&M Level 4 ...", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: "Insurance Coverage Error" },
    { date: "2026-07-15", description: "Paracetamol drug 500g", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: null },
    { date: "2026-07-15", description: "LRC Lab", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: "Mathematical Error" },
  ],
  errorsFound: 10,
  estimatedSavings: "$2,500",
  detectedIssues: ["Insurance coverage error", "Mathematical Error"],
  overBilled: "$5590",
  adjustedCharges: "$2500",
};
