import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentAnalysisClient from "./DocumentAnalysisClient";
import { MOCK_BILL_ANALYSIS } from "@/lib/billAnalysis";

const DOC = { id: "b1", filename: "bill.pdf", previewUrl: null, downloadUrl: null, isImage: false } as never;

describe("DocumentAnalysisClient", () => {
  it("renders an issue card with priority, category, savings and evidence", () => {
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} />);

    expect(screen.getByText("Issue 1")).toBeInTheDocument();
    expect(screen.getByText("High Priority")).toBeInTheDocument();
    expect(screen.getByText("Pricing inflation")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    expect(screen.getByText(/Tylenol 500mg medication charge/)).toBeInTheDocument();
  });

  it("omits the savings amount when an issue has none", () => {
    const analysis = {
      ...MOCK_BILL_ANALYSIS,
      issues: [{ category: "Other", priority: "Low" as const, summary: "s", evidence: [], potentialSavings: null }],
    };
    render(<DocumentAnalysisClient analysis={analysis} headerInfo={[]} doc={DOC} />);
    expect(screen.getByText("Low Priority")).toBeInTheDocument();
    expect(screen.queryByText(/Potential Savings/)).not.toBeInTheDocument();
  });

  it("renders no cards for older analyses without per-issue data", () => {
    const { issues, ...withoutIssues } = MOCK_BILL_ANALYSIS;
    void issues;
    render(<DocumentAnalysisClient analysis={withoutIssues} headerInfo={[]} doc={DOC} />);
    expect(screen.queryByText("Issue 1")).not.toBeInTheDocument();
  });

  it("shows the Appeal Letter card only when the bill has a case", () => {
    const { rerender } = render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} />);
    expect(screen.queryByText("Appeal Letter")).not.toBeInTheDocument();

    rerender(
      <DocumentAnalysisClient
        analysis={MOCK_BILL_ANALYSIS}
        headerInfo={[]}
        doc={DOC}
        appealLetter={{ caseId: "c1", text: "Dear", providerEmail: null, sentAt: null }}
      />,
    );
    expect(screen.getByText("Appeal Letter")).toBeInTheDocument();
  });
});
