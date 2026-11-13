import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const getAiServiceConfig = vi.fn();
const processCase = vi.fn();
const startNegotiationForCase = vi.fn();
const auditBill = vi.fn();
const getNegotiation = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
// AiServiceTimeoutError comes from the real module: the route does an
// `instanceof` check on it, and a stub class would make that check pass
// here while failing in production.
vi.mock("@/lib/ai-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-service")>()),
  getAiServiceConfig: (...args: unknown[]) => getAiServiceConfig(...args),
  processCase: (...args: unknown[]) => processCase(...args),
}));
// The start itself is covered in src/lib/startNegotiation.test.ts; what
// matters here is that the scan asks for one and reports the answer.
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  auditBill: (...args: unknown[]) => auditBill(...args),
  getNegotiation: (...args: unknown[]) => getNegotiation(...args),
}));
vi.mock("@/lib/startNegotiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/startNegotiation")>()),
  startNegotiationForCase: (...args: unknown[]) => startNegotiationForCase(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/dev/process-with-ai", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const USER = { id: "user-1" };
const BILL: { id: string; filename: string; storage_url: string | null; analysis_result: unknown } = {
  id: "bill-1",
  filename: "bill.pdf",
  storage_url: "user-1/bill.pdf",
  analysis_result: null,
};

const AI_RESPONSE = {
  case_id: "case-1",
  processed_documents: [
    {
      document: { document_id: "doc-1", original_filename: "bill.pdf" },
      extraction: {
        document_type: "hospital_bill",
        patient: { name: "Jordan Taylor", phone: null, email: null, address: null },
        provider: { name: "North Valley Hospital", phone: null, email: null, address: null },
        insurer: { name: null, phone: null, email: null, address: null },
        account_number: "ABC123",
        claim_number: null,
        statement_date: "2026-08-01",
        due_date: "2026-08-31",
        date_of_service_start: "2026-07-18",
        date_of_service_end: null,
        total_charges: { amount: 1000, currency: "USD" },
        insurance_paid: { amount: 500, currency: "USD" },
        adjustments: { amount: 0, currency: "USD" },
        patient_responsibility: { amount: 500, currency: "USD" },
        line_items: [],
        detected_issues: [],
        missing_fields: [],
        confidence: 0.5,
      },
      model_used: null,
      warnings: [],
    },
  ],
  analysis: {
    case_id: "case-1",
    document_count: 1,
    document_types: ["hospital_bill"],
    needs_human_review: true,
    confidence_score: 0.5,
    summary: "Found one issue.",
    financial_summary: {
      total_charges: { amount: 1000, currency: "USD" },
      insurance_paid: { amount: 500, currency: "USD" },
      adjustments: { amount: 0, currency: "USD" },
      patient_responsibility: { amount: 500, currency: "USD" },
      outstanding_balance: { amount: 500, currency: "USD" },
      document_count_with_amounts: 1,
    },
    issues: [{ category: "missing_adjustments", severity: "warning", summary: "No adjustments applied.", evidence: [] }],
    savings_opportunities: [
      { category: "missing_adjustments", title: "t", rationale: "r", estimated_savings: { amount: 100, currency: "USD" }, confidence: 0.5, evidence: [] },
    ],
    recommended_action: { action_type: "request_corrected_statement", title: "t", rationale: "r", required_documents: [], automation_ready: false },
  },
  draft: { subject: "s", recipient_type: "provider", body: "Dear Billing Manager...", tone: "professional", send_channel: "email" },
};

beforeEach(() => {
  vi.clearAllMocks();
  getAiServiceConfig.mockReturnValue({ baseUrl: "http://localhost:8000" });
  startNegotiationForCase.mockResolvedValue({ started: true, negotiation: { id: "neg-1" } });
  getNegotiation.mockResolvedValue({ id: "neg-1", messages: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function queueCaseRow(overrides: Partial<typeof BILL> = {}, caseOverrides: Record<string, unknown> = {}) {
  serverMock.queueResult("cases", {
    data: { id: "case-1", user_id: USER.id, bill_id: "bill-1", bills: { ...BILL, ...overrides }, ...caseOverrides },
    error: null,
  });
}

describe("POST /api/dev/process-with-ai", () => {
  it("rejects a non-string caseId", async () => {
    const res = await POST(makeRequest({ caseId: 123 }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the AI service isn't configured", async () => {
    // Checked after the case is loaded, so a more specific refusal (e.g.
    // an already-spent re-scan) isn't masked by our own misconfiguration.
    getAiServiceConfig.mockReturnValue(null);
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(503);
  });

  it("returns 401 when there is no authenticated user", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ caseId: "case-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the case doesn't belong to the caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: "someone-else", bills: BILL }, error: null });
    const res = await POST(makeRequest({ caseId: "case-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the case has no bill attached", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, bills: null }, error: null });
    const res = await POST(makeRequest({ caseId: "case-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the bill has no stored file", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({ storage_url: null });
    const res = await POST(makeRequest({ caseId: "case-1" }));
    expect(res.status).toBe(400);
  });

  it("is idempotent: returns ok without calling the AI service when already analyzed", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({ analysis_result: { analysisSummary: "already done" } });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      alreadyProcessed: true,
      // Offered even on this path: a case analyzed before the engine was
      // wired in would otherwise need a paid re-scan to get a letter.
      negotiation: { running: true, reason: null },
    });
    expect(processCase).not.toHaveBeenCalled();
  });

  it("returns 500 when the stored file can't be downloaded", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: null, error: { message: "not found" } });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(500);
  });

  it("returns 502 when the AI service call fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockRejectedValue(new Error("connection refused"));

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(502);
    expect((await res.json()).stage).toBe("ai_processing");
  });

  it("separates a timeout from a refusal", async () => {
    // Six cases sit at `scanning` in production and nothing records why.
    // These two failures want different responses -- "try again" is right
    // for a timeout and wrong for a service that answered with an error --
    // and until now both arrived as the same 502 with the same sentence.
    const { AiServiceTimeoutError } = await import("@/lib/ai-service");
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockRejectedValue(new AiServiceTimeoutError("/v1/cases/process", 240_000));

    const res = await POST(makeRequest({ caseId: "case-1" }));
    const body = await res.json();

    expect(res.status).toBe(504);
    expect(body.stage).toBe("ai_timeout");
    // The label is fixed text. The upstream message is not echoed, because
    // it can carry connection details.
    expect(JSON.stringify(body)).not.toContain("/v1/cases/process");
  });

  it("re-scans on force: drops the stored reading and calls the AI again", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({ analysis_result: { already: "there" } });
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await POST(makeRequest({ caseId: "case-1", force: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toMatchObject({ alreadyProcessed: true });
    expect(processCase).toHaveBeenCalled();
    expect(adminMock.from).toHaveBeenCalledWith("bill_extractions");
  });

  it("allows a second re-scan", async () => {
    // Raised from one to two on 2026-11-13, so there is a look available
    // after reading the analysis and the appeal letter together, just
    // before Proceed. One used is no longer the end of the allowance.
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow(
      { analysis_result: { already: "there" } },
      { rescanned_at: "2026-10-05T00:00:00Z", rescan_count: 1 },
    );
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    processCase.mockResolvedValue(AI_RESPONSE);

    const res = await POST(makeRequest({ caseId: "case-1", force: true }));

    expect(res.status).toBe(200);
    expect(processCase).toHaveBeenCalled();
  });

  it("refuses the third re-scan", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow(
      { analysis_result: { already: "there" } },
      { rescanned_at: "2026-10-05T00:00:00Z", rescan_count: 2 },
    );

    const res = await POST(makeRequest({ caseId: "case-1", force: true }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/used all 2 re-scans/i);
    expect(body.rescansRemaining).toBe(0);
    expect(processCase).not.toHaveBeenCalled();
  });

  it("records the re-scan so the next one is refused", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({ analysis_result: { already: "there" } });
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    await POST(makeRequest({ caseId: "case-1", force: true }));

    const i = adminMock.from.mock.calls.findIndex(([t]) => t === "cases");
    const update = adminMock.from.mock.results[i].value.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ rescanned_at: expect.any(String) }));
  });

  it("rejects a non-boolean force", async () => {
    const res = await POST(makeRequest({ caseId: "case-1", force: "yes" }));
    expect(res.status).toBe(400);
  });

  it("processes the bill and writes real analysis to bills and cases", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      errorsDetected: 1,
      savingsFound: 100,
      negotiation: { running: true, reason: null },
      // Reported so the screen can say how many are left without a
      // refetch. Two here: this was a first scan, not a re-scan, so
      // nothing has been spent.
      rescansRemaining: 2,
    });
    expect(processCase).toHaveBeenCalledWith("case-1", expect.objectContaining({ filename: "bill.pdf" }));

    // Located by table rather than call order: the route now checks the
    // cached AI reading first, so positions shift.
    const callIndex = (table: string) => adminMock.from.mock.calls.findIndex(([t]) => t === table);
    const updateFor = (table: string) =>
      adminMock.from.mock.results[callIndex(table)].value.update as ReturnType<typeof vi.fn>;

    expect(updateFor("bills")).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_name: "North Valley Hospital",
        service_date: "2026-07-18",
        statement_date: "2026-08-01",
      }),
    );

    const caseUpdate = updateFor("cases");
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        errors_detected: 1,
        savings_found: 100,
        appeal_letter_text: "Dear Billing Manager...",
        ai_summary_text: "Found one issue.",
      }),
    );
  });

  it("returns 500 when the bills update fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(500);
  });

  it("returns 500 when the cases update fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(500);
  });
  it("starts the negotiation for the scanned case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({}, { negotiation_id: null });
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    await POST(makeRequest({ caseId: "case-1" }));

    expect(startNegotiationForCase).toHaveBeenCalledWith(adminMock.client, {
      id: "case-1",
      // bill_id comes off the joined bill, not the case column, so a
      // case row with a null bill_id still reaches the right bill.
      bill_id: "bill-1",
      negotiation_id: null,
    });
  });

  it("reports the analysis even when no negotiation could be started", async () => {
    // The customer paid for the reading and it succeeded, so losing it
    // because the engine would not open a negotiation is the wrong
    // trade. `running: false` is what stops the UI claiming a letter.
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });
    startNegotiationForCase.mockResolvedValue({ started: false, blocked: "no_provider_email" });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      errorsDetected: 1,
      negotiation: { running: false, reason: "no_provider_email" },
    });
  });

  it("survives the start throwing rather than losing the analysis", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf bytes"]), error: null });
    processCase.mockResolvedValue(AI_RESPONSE);
    adminMock.queueResult("bills", { data: null, error: null });
    adminMock.queueResult("cases", { data: null, error: null });
    startNegotiationForCase.mockRejectedValue(new Error("engine unreachable"));

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ negotiation: { running: false, reason: "engine_refused" } });
  });

  it("treats a negotiation already running as nothing left to do", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow({ analysis_result: { any: "thing" } }, { negotiation_id: "neg-existing" });
    startNegotiationForCase.mockResolvedValue({ started: false, blocked: "already_started" });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(await res.json()).toMatchObject({
      alreadyProcessed: true,
      negotiation: { running: true, reason: "already_started" },
    });
    expect(processCase).not.toHaveBeenCalled();
  });
});

// --- the engine path -------------------------------------------------------
//
// Added 2026-11-11. Before this, the route selected only
// bill_extractions.result -- the ai-service's shape, which the information
// step stopped writing when it moved to the engine -- so it always missed
// the cache, downloaded the file again, and read every bill a second time
// through the weaker service. And the savings it stored came from the
// ai-service's savings_opportunities while the engine negotiated off its
// own audit, so the two disagreed on the same bill.
describe("POST /api/dev/process-with-ai - reading the bill with the engine", () => {
  const ENGINE_RESULT = {
    provider_name: "North Valley Hospital",
    patient_name: "Jordan Taylor",
    account_number: "IMG12345",
    statement_date: "2026-08-01",
    date_of_service: "2026-07-18",
    is_itemized: true,
    total_billed: 12450,
    patient_due: 4450,
    line_items: [
      { description: "ER Visit Level 5", cpt_code: "99285", date: "2026-07-18", quantity: 1, charge_amount: 2500 },
    ],
  };

  const AUDIT = {
    provider_name: "North Valley Hospital",
    patient_name: "Jordan Taylor",
    account_number: "IMG12345",
    total_billed: 12450,
    patient_due: 4450,
    audit_score: 62,
    risk_level: "elevated",
    issues_count: 1,
    needs_review_count: 0,
    flagged_amount: 2500,
    settlement_options: {
      aggressive_offer: 1168.12,
      fair_market_offer: 1800,
      prompt_pay_discount_offer: 2100,
      potential_savings: 2650,
      savings_percentage: 59,
    },
    issues: [
      {
        id: "f1",
        type: "duplicate_charge",
        severity: "critical",
        confidence: "high",
        title: "Possible Duplicate Charge",
        description: "Code 99285 appears twice.",
        disputed_amount: 2500,
        recommendation: "Remove it.",
        statute: "45 CFR 147.136",
        cpt_code: "99285",
      },
    ],
  };

  /** update() arguments across every builder created for `table`. */
  function updatesTo(table: string): unknown[][] {
    return adminMock.from.mock.calls
      .map((call, index) => ({ table: call[0], result: adminMock.from.mock.results[index] }))
      .filter((entry) => entry.table === table)
      .flatMap((entry) => {
        const builder = entry.result?.value as Record<string, { mock?: { calls: unknown[][] } }>;
        return builder?.update?.mock?.calls ?? [];
      });
  }

  function engineCase() {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.queueResult("bill_extractions", { data: { engine_result: ENGINE_RESULT, result: null }, error: null });
  }

  it("uses the reading the engine already made instead of reading it again", async () => {
    engineCase();
    auditBill.mockResolvedValue(AUDIT);

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    // The whole point: no second read, and no second download.
    expect(processCase).not.toHaveBeenCalled();
    expect(adminMock.storageDownload).not.toHaveBeenCalled();
    expect(auditBill).toHaveBeenCalledTimes(1);
  });

  it("quotes the engine's own savings figure, not a separately computed one", async () => {
    engineCase();
    auditBill.mockResolvedValue(AUDIT);

    const body = await (await POST(makeRequest({ caseId: "case-1" }))).json();

    expect(body.savingsFound).toBe(2650);
    expect(body.savingsFound).toBe(AUDIT.settlement_options.potential_savings);
    expect(body.errorsDetected).toBe(1);
  });

  it("stores that same figure on the case and in the analysis", async () => {
    engineCase();
    auditBill.mockResolvedValue(AUDIT);

    await POST(makeRequest({ caseId: "case-1" }));

    const billUpdate = updatesTo("bills")[0][0] as { analysis_result: { estimatedSavings: string } };
    expect(billUpdate.analysis_result.estimatedSavings).toBe("$2,650.00");
    const caseUpdate = updatesTo("cases").find((args) => "savings_found" in (args[0] as object));
    expect((caseUpdate![0] as { savings_found: number }).savings_found).toBe(2650);
  });

  it("does not overwrite the provider details the information step saved", async () => {
    // The engine's extraction already filled these when it read the bill
    // for the form; re-writing them here would undo anything the customer
    // corrected afterwards.
    engineCase();
    auditBill.mockResolvedValue(AUDIT);

    await POST(makeRequest({ caseId: "case-1" }));

    const billUpdate = updatesTo("bills")[0][0] as Record<string, unknown>;
    expect(Object.keys(billUpdate)).toEqual(["analysis_result"]);
  });

  it("works with no ai-service configured at all", async () => {
    // A bill the engine has read does not need it, and refusing here used
    // to block the path that no longer uses it.
    getAiServiceConfig.mockReturnValue(null);
    engineCase();
    auditBill.mockResolvedValue(AUDIT);

    expect((await POST(makeRequest({ caseId: "case-1" }))).status).toBe(200);
  });

  it("reports a failed audit as its own stage", async () => {
    engineCase();
    auditBill.mockRejectedValue(new Error("engine down"));

    const res = await POST(makeRequest({ caseId: "case-1" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.stage).toBe("engine_audit");
    expect(JSON.stringify(body)).not.toContain("engine down");
  });

  it("stores the letter the engine actually sent", async () => {
    // Not a second draft nobody sent: the engine writes and dispatches the
    // letter as part of starting, so the stored text is read back from it.
    engineCase();
    auditBill.mockResolvedValue(AUDIT);
    adminMock.queueResult("cases", { data: { negotiation_id: "neg-1" }, error: null });
    getNegotiation.mockResolvedValue({
      id: "neg-1",
      messages: [{ direction: "OUTBOUND", content_markdown: "Dear Patient Financial Services" }],
    });

    await POST(makeRequest({ caseId: "case-1" }));

    const stored = updatesTo("cases").find((args) => "appeal_letter_text" in (args[0] as object));
    expect(stored).toBeTruthy();
  });

  it("falls back to the ai-service reading for a bill read before the switch", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    queueCaseRow();
    adminMock.queueResult("bill_extractions", { data: { engine_result: null, result: AI_RESPONSE }, error: null });

    const res = await POST(makeRequest({ caseId: "case-1" }));

    expect(res.status).toBe(200);
    expect(auditBill).not.toHaveBeenCalled();
    // Reused, not re-read.
    expect(processCase).not.toHaveBeenCalled();
  });
});
