import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const approveHeldSettlement = vi.fn();
const isBackendConfigured = vi.fn();
const getDomainAccess = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
}));
// The real class, so `instanceof` in the route behaves as it does in
// production — a hand-rolled stub would make the 409 pass-through untested.
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  approveHeldSettlement: (...a: unknown[]) => approveHeldSettlement(...a),
}));

const { POST } = await import("./route");
const { AutomationEngineError } = await import("@/lib/automation-engine");

const params = Promise.resolve({ id: "case-1" });
const request = () => new Request("http://localhost/api/admin/cases/case-1/negotiation/approve-settlement", { method: "POST" });

const ADMIN = { id: "admin-1" };

function adminCaller({ role = "admin", access = "full", negotiationId = "neg-1" as string | null } = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
  serverMock.queueResult("profiles", { data: { role }, error: null });
  getDomainAccess.mockResolvedValue(access);
  isBackendConfigured.mockReturnValue(true);
  serverMock.queueResult("cases", { data: { id: "case-1", negotiation_id: negotiationId }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/cases/[id]/negotiation/approve-settlement", () => {
  it("approves the held settlement and returns the engine's view", async () => {
    adminCaller();
    approveHeldSettlement.mockResolvedValue({ id: "neg-1", status: "SETTLEMENT_AGREED", settled_amount: 363 });

    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "SETTLEMENT_AGREED", settled_amount: 363 });
    // No amount is passed: the engine settles at the figure it held.
    expect(approveHeldSettlement).toHaveBeenCalledWith("neg-1");
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });

    expect((await POST(request(), { params })).status).toBe(401);
    expect(approveHeldSettlement).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in customer", async () => {
    adminCaller({ role: "customer" });

    expect((await POST(request(), { params })).status).toBe(403);
    expect(approveHeldSettlement).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin without full negotiation access", async () => {
    // Approving commits the client to an amount, so read_only is not enough.
    adminCaller({ access: "read_only" });

    expect((await POST(request(), { params })).status).toBe(403);
    expect(approveHeldSettlement).not.toHaveBeenCalled();
  });

  it("returns 503 when the engine is not configured", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    getDomainAccess.mockResolvedValue("full");
    isBackendConfigured.mockReturnValue(false);

    expect((await POST(request(), { params })).status).toBe(503);
    expect(approveHeldSettlement).not.toHaveBeenCalled();
  });

  it("returns 404 for a case that does not exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    getDomainAccess.mockResolvedValue("full");
    isBackendConfigured.mockReturnValue(true);
    serverMock.queueResult("cases", { data: null, error: null });

    expect((await POST(request(), { params })).status).toBe(404);
  });

  it("returns 409 when the case has no negotiation at all", async () => {
    adminCaller({ negotiationId: null });

    expect((await POST(request(), { params })).status).toBe(409);
    expect(approveHeldSettlement).not.toHaveBeenCalled();
  });

  it("passes the engine's 409 through rather than reporting itself broken", async () => {
    // Nothing held, or held with no agreed figure. That is the admin's
    // answer, not a server fault.
    adminCaller();
    approveHeldSettlement.mockRejectedValue(
      new AutomationEngineError("Automation engine approve held settlement failed with status 409: nope", 409, "nope"),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "There is no held settlement to approve on this case." });
  });

  it("returns 502 when the engine is unreachable", async () => {
    adminCaller();
    approveHeldSettlement.mockRejectedValue(new Error("connect ECONNREFUSED"));

    expect((await POST(request(), { params })).status).toBe(502);
  });

  it("returns 502 for an engine error that is not a 409", async () => {
    adminCaller();
    approveHeldSettlement.mockRejectedValue(
      new AutomationEngineError("Automation engine approve held settlement failed with status 500: boom", 500, "boom"),
    );

    expect((await POST(request(), { params })).status).toBe(502);
  });
});
