// The shape `bills.analysis_result` holds once a bill has been analysed.
//
// It is no longer always null: the first bill to go all the way through
// this pipeline was analysed on 2026-11-11, so real analyses exist now and
// the "nothing visibly changes until real data exists" reasoning behind the
// old mock fallback has expired with it.
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
  // Per-issue detail for the Figma "Issue N" cards. Optional: analyses
  // stored before this existed simply don't render cards.
  issues?: BillIssue[];
  overBilled: string;
  adjustedCharges: string;
};

export type BillIssue = {
  category: string;
  priority: "High" | "Medium" | "Low";
  summary: string;
  evidence: string[];
  // null when the AI produced no savings opportunity for this category.
  potentialSavings: string | null;
};

/**
 * A FIXTURE FOR TESTS. Never render this to a customer.
 *
 * It was the fallback on /dashboard/documents/[id] for any bill without an
 * analysis, which meant a real customer opening their own un-analysed bill
 * was shown a complete fabricated medical record: patient "Dave J.
 * Collins", member id "UCH-810-4474", four invented clinical line items,
 * ten errors found and $2,500 of savings. None of it theirs, all of it
 * presented as theirs. Use EMPTY_BILL_ANALYSIS for that case instead.
 */
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
  issues: [
    {
      category: "Pricing inflation",
      priority: "High",
      summary: "Tylenol 500mg medication charge exceeds reasonable pricing standards",
      evidence: ["Line Item: Emergency Room Visit Level 4, 99284, 05/12/2025, $2,850"],
      potentialSavings: "$1,500",
    },
  ],
  overBilled: "$5590",
  adjustedCharges: "$2500",
};

/**
 * What to show for a bill that has not been analysed: the same shape, with
 * nothing invented in it. Blank strings and empty lists render as the
 * page's own empty states, which is the truth — this bill has not been
 * read yet — rather than someone else's bill.
 */
export const EMPTY_BILL_ANALYSIS: BillAnalysis = {
  analysisSummary: "",
  memberName: "",
  memberId: "",
  group: "",
  claimNumber: "",
  accountNumber: "",
  amountBreakdown: [],
  lineItems: [],
  errorsFound: 0,
  estimatedSavings: "",
  detectedIssues: [],
  issues: [],
  overBilled: "",
  adjustedCharges: "",
};
