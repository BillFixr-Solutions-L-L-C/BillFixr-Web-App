import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const acceptOffer = vi.fn();
const getNegotiation = vi.fn();
const isBackendConfigured = vi.fn();
const getDomainAccess = vi.fn();
const syncSettlementFigures = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
}));
vi.mock("@/lib/settlementFigures", () => ({
  syncSettlementFigures: (...a: unknown[]) => syncSettlementFigures(...a),
}));
// The real class, so `instanceof` in the route behaves as it does in
// production.
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  acceptOffer: (...a: unknown[]) => acceptOffer(...a),
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
}));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const request = (body: unknown) =>
  new Request("http://localhost/api/admin/cases/case-1/negotiation/accept-settlement", {
    method: "POST",
    body: JSON.stringify(body),
  });

// The engine's view: $1,818.13 billed, $428.53 left to the patient.
const OFFERED = {
  id: "neg-1",
  status: "COUNTER_OFFER_RECEIVED",
  total_billed: 1818.13,
  original_balance_due: 428.53,
  settled_amount: null,
};

function adminCaller({ role = "admin", access = "full", negotiationId = "neg-1" as string | null } = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  serverMock.queueResult("profiles", { data: { role }, error: null });
  getDomainAccess.mockResolvedValue(access);
  isBackendConfigured.mockReturnValue(true);
  serverMock.queueResult("cases", {
    data: { id: "case-1", user_id: "user-1", status: "response_received", negotiation_id: negotiationId },
    error: null,
  });
  getNegotiation.mockResolvedValue(OFFERED);
  acceptOffer.mockResolvedValue({ ...OFFERED, status: "SETTLEMENT_AGREED", settled_amount: 112.49 });
  syncSettlementFigures.mockResolvedValue({ written: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/cases/[id]/negotiation/accept-settlement", () => {
  it("accepts at the figure the admin entered", async () => {
    adminCaller();

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(200);
    expect(acceptOffer).toHaveBeenCalledWith("neg-1", 112.49);
  });

  it("always sends an explicit amount, because the engine's default is a made-up number", async () => {
    // POST /accept falls back to current_demanded_balance and then to a
    // hardcoded 175.00. A settlement must never be a figure nobody chose.
    adminCaller();

    await POST(request({ amount: 112.49 }), { params });

    const [, sent] = acceptOffer.mock.calls[0];
    expect(sent).toBe(112.49);
    expect(sent).not.toBeUndefined();
    expect(sent).not.toBeNull();
  });

  it("writes the agreed figures onto the case, so the fee is charged on them", async () => {
    adminCaller();

    await POST(request({ amount: 112.49 }), { params });

    expect(syncSettlementFigures).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "case-1" }),
      expect.objectContaining({ settled_amount: 112.49 }),
    );
  });

  it("rounds to the cent", async () => {
    adminCaller();

    await POST(request({ amount: 112.4949 }), { params });

    expect(acceptOffer).toHaveBeenCalledWith("neg-1", 112.49);
  });

  it("refuses an amount that is not a reduction", async () => {
    // The client already owes $428.53. "Settling" at or above that records
    // a reduction of zero and bills a share of nothing.
    adminCaller();

    const res = await POST(request({ amount: 428.53 }), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not a reduction/i);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it.each([[0], [-5], ["abc"], [null], [undefined]])("refuses a missing or nonsense amount (%s)", async (amount) => {
    adminCaller();

    const res = await POST(request({ amount }), { params });

    expect(res.status).toBe(400);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("refuses when the provider has not responded at all", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue({ ...OFFERED, status: "DISPATCHED" });

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/hasn't responded/i);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("refuses a case that is already settled", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue({ ...OFFERED, settled_amount: 200 });

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(409);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("refuses anyone without full access to the negotiation domain", async () => {
    adminCaller({ access: "read_only" });

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(403);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    adminCaller({ role: "customer" });

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(403);
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("still reports success when the figures could not be written", async () => {
    // The settlement is recorded with the engine and cannot be redone.
    // The figures are rewritten on the next read of this case.
    adminCaller();
    syncSettlementFigures.mockRejectedValue(new Error("db down"));

    const res = await POST(request({ amount: 112.49 }), { params });

    expect(res.status).toBe(200);
  });
});
