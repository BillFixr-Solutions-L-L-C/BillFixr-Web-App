import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import DocumentAnalysisPage from "./page";

const mock = createSupabaseMock();
const adminMock = createSupabaseMock();
const getDomainAccess = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mock.client,
}));
// Staff reading a customer's analysis come through the service role,
// because the customer's own policy is what refused the first read.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock.client }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
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
  adminMock.reset();
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // Not staff unless a test says so.
  getDomainAccess.mockResolvedValue("none");
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

// Staff reading a customer's analysis.
//
// The admin case screen lists an "Analysis Generated" row. Until
// 2026-11-24 it carried no link, because this page was scoped to the
// owner: an admin following it got a 404, so the team could see that an
// analysis existed and had no way to read it.
describe("an admin opening a customer's analysis", () => {
  function asStaff(access: string, caseOverrides: Record<string, unknown> = {}) {
    // The customer-scoped read finds nothing: this bill is not theirs.
    mock.queueResult("bills", { data: null, error: null });
    getDomainAccess.mockResolvedValue(access);
    adminMock.queueResult("bills", { data: BILL, error: null });
    adminMock.queueResult("cases", { data: { ...CASE, ...caseOverrides }, error: null });
  }

  it("reads it when they have client_data access", async () => {
    asStaff("full");

    const captured = await renderPage();

    expect(captured.analysis).toBeDefined();
    expect(adminMock.from).toHaveBeenCalledWith("bills");
  });

  it("is refused without it", async () => {
    mock.queueResult("bills", { data: null, error: null });
    getDomainAccess.mockResolvedValue("none");

    await expect(renderPage()).rejects.toThrow();
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("never offers them Re-scan or Proceed", async () => {
    // Re-scan spends the customer's allowance and Proceed writes to their
    // provider. Neither is staff's to press, even on a case sitting
    // exactly at the decision point.
    asStaff("full", { letter_sent_at: null, negotiation_id: null });

    const captured = await renderPage();

    expect(captured.atDecisionPoint).toBe(false);
  });

  it("still offers them to the customer whose case it is", async () => {
    // The owner-scoped read succeeds, so nothing staff-related happens.
    mock.queueResult("bills", { data: BILL, error: null });
    mock.queueResult("cases", { data: CASE, error: null });

    const captured = await renderPage();

    expect(captured.atDecisionPoint).toBe(true);
    expect(adminMock.from).not.toHaveBeenCalled();
  });
});
