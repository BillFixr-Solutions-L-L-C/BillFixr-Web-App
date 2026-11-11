import { describe, expect, it } from "vitest";

import { EMPTY_BILL_ANALYSIS, MOCK_BILL_ANALYSIS } from "@/lib/billAnalysis";

// /dashboard/documents/[id] used to fall back to MOCK_BILL_ANALYSIS for any
// bill without an analysis, so a customer opening their own un-analysed
// bill was shown a complete fabricated medical record -- patient "Dave J.
// Collins", member id "UCH-810-4474", four invented clinical line items,
// ten errors found and $2,500 of savings. The fallback is now
// EMPTY_BILL_ANALYSIS.
describe("EMPTY_BILL_ANALYSIS", () => {
  it("carries no invented identity", () => {
    expect(EMPTY_BILL_ANALYSIS.memberName).toBe("");
    expect(EMPTY_BILL_ANALYSIS.memberId).toBe("");
    expect(EMPTY_BILL_ANALYSIS.accountNumber).toBe("");
    expect(EMPTY_BILL_ANALYSIS.claimNumber).toBe("");
  });

  it("carries no invented clinical detail", () => {
    expect(EMPTY_BILL_ANALYSIS.lineItems).toEqual([]);
    expect(EMPTY_BILL_ANALYSIS.amountBreakdown).toEqual([]);
    expect(EMPTY_BILL_ANALYSIS.detectedIssues).toEqual([]);
    expect(EMPTY_BILL_ANALYSIS.issues).toEqual([]);
  });

  it("claims no findings and no savings", () => {
    // A bill nobody has read has not been found to have 10 errors.
    expect(EMPTY_BILL_ANALYSIS.errorsFound).toBe(0);
    expect(EMPTY_BILL_ANALYSIS.estimatedSavings).toBe("");
    expect(EMPTY_BILL_ANALYSIS.overBilled).toBe("");
    expect(EMPTY_BILL_ANALYSIS.adjustedCharges).toBe("");
    expect(EMPTY_BILL_ANALYSIS.analysisSummary).toBe("");
  });

  it("shares none of the mock's content", () => {
    // Belt and braces: whatever the fixture grows later, none of it may
    // leak into the thing shown when there is no analysis.
    const empty = JSON.stringify(EMPTY_BILL_ANALYSIS);
    expect(empty).not.toContain("Dave J. Collins");
    expect(empty).not.toContain("UCH-810-4474");
    expect(empty).not.toContain("2,345");
    expect(empty).not.toContain("2,500");
    expect(empty).not.toContain("Lorem ipsum");
  });

  it("is the same shape as a real analysis, so the page renders unchanged", () => {
    expect(Object.keys(EMPTY_BILL_ANALYSIS).sort()).toEqual(Object.keys(MOCK_BILL_ANALYSIS).sort());
  });
});
