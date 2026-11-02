import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const auditBill = vi.fn();
const startNegotiation = vi.fn();
const getNegotiation = vi.fn();
const isBackendConfigured = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/automation-engine", () => ({
  auditBill: (...a: unknown[]) => auditBill(...a),
  startNegotiation: (...a: unknown[]) => startNegotiation(...a),
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
}));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));

const { GET, POST } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const USER = { id: "user-1" };
const OWN_CASE = { id: "case-1", user_id: USER.id, bill_id: "bill-1", negotiation_id: null };
const AUDIT = {
  settlement_options: { aggressive_offer: 1200, fair_market_offer: 1500, potential_savings: 800 },
};
const request = () => new Request("http://localhost/api/dashboard/cases/case-1/negotiation", { method: "POST" });

function readyToStart({
  caseRow = OWN_CASE,
  fee = { processor_ref: "pi_1" },
  extraction = { result: { total: 5000 } },
}: {
  caseRow?: typeof OWN_CASE;
  fee?: { processor_ref: string } | null;
  extraction?: { result: unknown } | null;
} = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("cases", { data: caseRow, error: null });
  serverMock.queueResult("bills", {
    data: { id: "bill-1", provider_email: "billing@hospital.test", provider_support_email: null },
    error: null,
  });
  serverMock.queueResult("payment_records", { data: fee, error: null });
  serverMock.queueResult("bill_extractions", { data: extraction, error: null });
  adminMock.queueResult("app_settings", { data: { success_fee_percentage: 20 }, error: null });
  isBackendConfigured.mockReturnValue(true);
  auditBill.mockResolvedValue(AUDIT);
  startNegotiation.mockResolvedValue({ id: "neg-1", status: "active" });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/dashboard/cases/[id]/negotiation", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(), { params })).status).toBe(401);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, user_id: "someone-else" }, error: null });
    expect((await POST(request(), { params })).status).toBe(404);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("returns 503 when the engine isn't configured", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: OWN_CASE, error: null });
    isBackendConfigured.mockReturnValue(false);

    expect((await POST(request(), { params })).status).toBe(503);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("refuses to start a second negotiation on the same case", async () => {
    // A second start would strand the first, along with whatever it has
    // already sent to the provider.
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, negotiation_id: "neg-existing" }, error: null });
    isBackendConfigured.mockReturnValue(true);

    expect((await POST(request(), { params })).status).toBe(409);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("will not write to a provider without a billing email", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: OWN_CASE, error: null });
    serverMock.queueResult("bills", { data: { id: "bill-1", provider_email: null }, error: null });
    isBackendConfigured.mockReturnValue(true);

    expect((await POST(request(), { params })).status).toBe(409);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("returns 402 when the commitment fee hasn't been paid", async () => {
    readyToStart({ fee: null });

    expect((await POST(request(), { params })).status).toBe(402);
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("returns 409 when the bill has not been read yet", async () => {
    readyToStart({ extraction: null });

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    expect(auditBill).not.toHaveBeenCalled();
  });

  it("audits the extracted bill, opens at the aggressive offer, and links the negotiation", async () => {
    readyToStart();

    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    expect(auditBill).toHaveBeenCalledWith({ total: 5000 });
    expect(startNegotiation).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOffer: 1200,
        hospitalEmail: "billing@hospital.test",
        commitmentPaymentRef: "pi_1",
        // 20% stored as a percentage, sent as the rate the engine expects.
        completionFeeRate: 0.2,
      }),
    );
    const link = adminMock.from.mock.results[1].value.update;
    expect(link).toHaveBeenCalledWith({ negotiation_id: "neg-1" });
  });

  it("reports a failure rather than leaving the case looking unstarted", async () => {
    // The engine may already be writing to the hospital, so a lost link
    // is a 500 the caller can act on, not a silent success.
    readyToStart();
    adminMock.queueResult("cases", { data: null, error: { message: "update failed" } });

    const res = await POST(request(), { params });

    expect(res.status).toBe(500);
  });

  it("does not link anything when the engine refuses to start", async () => {
    readyToStart();
    startNegotiation.mockRejectedValue(new Error("engine down"));

    const res = await POST(request(), { params });

    expect(res.status).toBe(502);
  });
});

describe("GET /api/dashboard/cases/[id]/negotiation", () => {
  it("returns 404 when nothing has been started", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: OWN_CASE, error: null });

    expect((await GET(request(), { params })).status).toBe(404);
    expect(getNegotiation).not.toHaveBeenCalled();
  });

  it("returns the engine's view of a started negotiation", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, negotiation_id: "neg-1" }, error: null });
    isBackendConfigured.mockReturnValue(true);
    getNegotiation.mockResolvedValue({ id: "neg-1", status: "awaiting_response" });

    const res = await GET(request(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "neg-1", status: "awaiting_response" });
    expect(getNegotiation).toHaveBeenCalledWith("neg-1");
  });

  it("returns 404 for someone else's case before asking the engine anything", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, user_id: "other", negotiation_id: "neg-1" }, error: null });

    expect((await GET(request(), { params })).status).toBe(404);
    expect(getNegotiation).not.toHaveBeenCalled();
  });
});
