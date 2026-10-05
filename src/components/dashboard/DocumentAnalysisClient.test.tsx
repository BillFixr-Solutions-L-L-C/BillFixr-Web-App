import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentAnalysisClient from "./DocumentAnalysisClient";
import { MOCK_BILL_ANALYSIS } from "@/lib/billAnalysis";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

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

  it("shows Re-scan and Proceed once the bill has a case", () => {
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" />);
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proceed" })).toHaveAttribute("href", "/dashboard/case");
  });

  it("hides them when there is no case yet", () => {
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} />);
    expect(screen.queryByRole("button", { name: "Re-scan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Proceed" })).not.toBeInTheDocument();
  });

  it("re-scan asks for a fresh read and refreshes the page", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" />);

    await user.click(screen.getByRole("button", { name: "Re-scan" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/dev/process-with-ai");
    expect(JSON.parse(init.body)).toEqual({ caseId: "case-1", force: true });
  });

  it("shows why a re-scan failed instead of silently doing nothing", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "AI processing failed" }), { status: 502 }),
    );
    const user = userEvent.setup();
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" />);

    await user.click(screen.getByRole("button", { name: "Re-scan" }));

    expect(await screen.findByText("AI processing failed")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
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
