import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const getAiServiceConfig = vi.fn();
const processCase = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
vi.mock("@/lib/ai-service", () => ({
  getAiServiceConfig: (...args: unknown[]) => getAiServiceConfig(...args),
  processCase: (...args: unknown[]) => processCase(...args),
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
    getAiServiceConfig.mockReturnValue(null);
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
    expect(await res.json()).toEqual({ ok: true, alreadyProcessed: true });
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
    expect(await res.json()).toEqual({ ok: true, errorsDetected: 1, savingsFound: 100 });
    expect(processCase).toHaveBeenCalledWith("case-1", expect.objectContaining({ filename: "bill.pdf" }));

    const billUpdate = adminMock.from.mock.results[0].value.update as ReturnType<typeof vi.fn>;
    expect(billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_name: "North Valley Hospital",
        service_date: "2026-07-18",
        statement_date: "2026-08-01",
      }),
    );

    const caseUpdate = adminMock.from.mock.results[1].value.update as ReturnType<typeof vi.fn>;
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
});
