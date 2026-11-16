import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import DocumentAnalysisPage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mock.client,
}));
vi.mock("@/lib/billDocuments", () => ({
  getBillDocuments: async () => [{ id: "bill-1", filename: "bill.png", previewUrl: null, downloadUrl: null }],
}));

// The page under test renders one client component. Capturing its props
// is the whole point: what is being tested is the decision the server
// makes, not how a button looks.
let props: Record<string, unknown> = {};
vi.mock("@/components/dashboard/DocumentAnalysisClient", () => ({
  default: (received: Record<string, unknown>) => {
    props = received;
    return <div data-testid="analysis" />;
  },
}));

const BILL = {
  id: "bill-1",
  filename: "bill.png",
  storage_url: "u/bill.png",
  status: "analyzed",
  provider_name: "Matthew Walker",
  service_date: null,
  statement_date: null,
  analysis_result: { analysisSummary: "Two issues found." },
};

const CASE = {
  id: "case-1",
  status: "analyzed",
  errors_detected: 2,
  appeal_letter_text: null,
  provider_email: null,
  letter_sent_at: null,
  negotiation_id: null,
  rescanned_at: null,
  rescan_count: 0,
};

async function renderPage() {
  props = {};
  render(await DocumentAnalysisPage({ params: Promise.resolve({ id: "bill-1" }) }));
  return props;
}

beforeEach(() => {
  mock.reset();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// Asked for on 2026-11-13: Re-scan and Proceed should only be on this
// page while the process is still running up to the dispute going out —
// "By the time they are opening the Analysis on the active case it
// shouldn't show rescan or proceed."
describe("the analysis page's actions", () => {
  it("offers them while the dispute has not gone to the provider", async () => {
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", { data: CASE, error: null });

    expect((await renderPage()).atDecisionPoint).toBe(true);
  });

  it("withholds them once the appeal letter is with the provider", async () => {
    // The dispute was written from this analysis. Re-reading the bill now
    // would replace the findings the provider is answering.
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", {
      data: { ...CASE, status: "letter_sent", letter_sent_at: "2026-11-13T20:44:39Z", negotiation_id: "neg-1" },
      error: null,
    });

    expect((await renderPage()).atDecisionPoint).toBe(false);
  });

  it("withholds them on a negotiation whose send is not recorded yet", async () => {
    // A negotiation exists, so the engine is already talking to the
    // provider, whether or not letter_sent_at caught up.
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", { data: { ...CASE, negotiation_id: "neg-1" }, error: null });

    expect((await renderPage()).atDecisionPoint).toBe(false);
  });

  it("does not decide it on the commitment fee", async () => {
    // The other candidate, and the wrong one: the $5 is paid before the
    // bill is read, so "analysed but unpaid" never happens and gating on
    // it would hide the buttons always, for a reason that is not true.
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", { data: CASE, error: null });

    await renderPage();

    expect(mock.from).not.toHaveBeenCalledWith("payment_records");
  });

  it("withholds them on a bill with no case at all", async () => {
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", { data: null, error: null });

    const captured = await renderPage();
    expect(captured.atDecisionPoint).toBe(false);
    expect(captured.caseId).toBe(null);
  });
});
