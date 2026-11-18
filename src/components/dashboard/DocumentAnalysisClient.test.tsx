import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentAnalysisClient from "./DocumentAnalysisClient";
import { MOCK_BILL_ANALYSIS } from "@/lib/billAnalysis";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

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

  it("shows Re-scan and Proceed while the customer is deciding", () => {
    render(
      <DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" atDecisionPoint />,
    );
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
    // A button, not a link, since 2026-11-18: pressing it is what sends
    // the dispute, so it cannot be a plain navigation any more.
    expect(screen.getByRole("button", { name: "Proceed" })).toBeInTheDocument();
  });

  // Asked for on 2026-11-13: these two belong to the stretch between
  // upload and the commitment fee. "By the time they are opening the
  // Analysis on the active case it shouldn't show rescan or proceed."
  it("shows neither once the case is past the commitment fee", () => {
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" />);
    expect(screen.queryByRole("button", { name: /Re-scan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Proceed" })).not.toBeInTheDocument();
  });

  it("drops Re-scan once the allowance is spent, leaving Proceed", () => {
    // "the next after rescan will only show proceed" — a dead button
    // with a tooltip nobody hovers on a phone is worse than no button
    // and a sentence.
    render(
      <DocumentAnalysisClient
        analysis={MOCK_BILL_ANALYSIS}
        headerInfo={[]}
        doc={DOC}
        caseId="case-1"
        atDecisionPoint
        canRescan={false}
        rescanHint="You've used your re-scan for this bill."
      />,
    );
    expect(screen.queryByRole("button", { name: /Re-scan/ })).not.toBeInTheDocument();
    // The hint comes from src/lib/rescan.ts so the screen and the route
    // cannot disagree about how many are left.
    expect(screen.getByText(/used your re-scan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proceed" })).toBeInTheDocument();
  });

  it("hides them when there is no case yet", () => {
    render(<DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} atDecisionPoint />);
    expect(screen.queryByRole("button", { name: "Re-scan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Proceed" })).not.toBeInTheDocument();
  });

  it("re-scan asks for a fresh read and refreshes the page", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(
      <DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" atDecisionPoint />,
    );

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
    render(
      <DocumentAnalysisClient analysis={MOCK_BILL_ANALYSIS} headerInfo={[]} doc={DOC} caseId="case-1" atDecisionPoint />,
    );

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

// Proceed is what sends the dispute, as of 2026-11-18.
//
// Before that it was a plain link to the case screen, because the scan
// had already started the negotiation and the engine had already written
// to the provider. So the customer's "Proceed" moved them to a page about
// something that had happened without them, and the Re-scan beside it
// could never appear.
describe("Proceed", () => {
  function atDecision() {
    return render(
      <DocumentAnalysisClient
        analysis={MOCK_BILL_ANALYSIS}
        headerInfo={[]}
        doc={DOC}
        caseId="case-1"
        atDecisionPoint
      />,
    );
  }

  it("starts the negotiation for this case, then goes to the case screen", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "neg-1" }), { status: 200 }));
    const user = userEvent.setup();
    atDecision();

    await user.click(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/case"));
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/dashboard/cases/case-1/negotiation");
    expect(init.method).toBe("POST");
  });

  it("stays put and says why when the dispute could not be sent", async () => {
    // The route knows which precondition failed, and "add the provider's
    // billing email" is worth more to the customer than a generic
    // failure — so its wording wins where it has some.
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Add the provider's billing department email before starting." }), {
          status: 409,
        }),
    );
    const user = userEvent.setup();
    atDecision();

    await user.click(screen.getByRole("button", { name: "Proceed" }));

    expect(await screen.findByText(/billing department email/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("cannot be pressed twice into two letters", async () => {
    // The engine sends a letter as part of starting, so a double press
    // is a second letter to a real hospital. The button disables on the
    // first press and the request is never made again.
    let resolve: (value: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const user = userEvent.setup();
    atDecision();

    const button = screen.getByRole("button", { name: "Proceed" });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    resolve(new Response(JSON.stringify({ id: "neg-1" }), { status: 200 }));
  });

  it("disables Re-scan while the dispute is being sent", async () => {
    // Re-reading the bill mid-send would replace the findings the letter
    // is being written from.
    let resolve: (value: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const user = userEvent.setup();
    atDecision();

    await user.click(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Re-scan" })).toBeDisabled());
    resolve(new Response(JSON.stringify({ id: "neg-1" }), { status: 200 }));
  });
});
