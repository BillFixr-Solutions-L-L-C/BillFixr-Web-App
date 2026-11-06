import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const getNegotiation = vi.fn();
const startNegotiationForCase = vi.fn();
const isBackendConfigured = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/automation-engine", () => ({
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
}));
// The guards and the engine call live in src/lib/startNegotiation.ts and
// are tested there. This route's remaining job is ownership and turning
// an outcome into a status code, which is all that is asserted here.
vi.mock("@/lib/startNegotiation", () => ({
  startNegotiationForCase: (...a: unknown[]) => startNegotiationForCase(...a),
}));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));

const { GET, POST } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const USER = { id: "user-1" };
const OWN_CASE = { id: "case-1", user_id: USER.id, status: "scanning", bill_id: "bill-1", negotiation_id: null };

const request = () => new Request("http://localhost/api/dashboard/cases/case-1/negotiation", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ownedCase(caseRow: Record<string, unknown> | null = OWN_CASE) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("cases", { data: caseRow, error: null });
}

describe("POST /api/dashboard/cases/[id]/negotiation", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(), { params })).status).toBe(401);
    expect(startNegotiationForCase).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's case", async () => {
    ownedCase({ ...OWN_CASE, user_id: "someone-else" });
    expect((await POST(request(), { params })).status).toBe(404);
    expect(startNegotiationForCase).not.toHaveBeenCalled();
  });

  it("returns 404 for a case that does not exist", async () => {
    ownedCase(null);
    expect((await POST(request(), { params })).status).toBe(404);
    expect(startNegotiationForCase).not.toHaveBeenCalled();
  });

  it("starts the negotiation with the service role and returns the engine's view", async () => {
    // Service role on purpose: bill_extractions has RLS on with no
    // policies, so reading it through the session client returns nothing
    // and the start refuses every case as "this bill hasn't been read".
    ownedCase();
    startNegotiationForCase.mockResolvedValue({ started: true, negotiation: { id: "neg-1", status: "DISPATCHED" } });

    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "neg-1", status: "DISPATCHED" });
    expect(startNegotiationForCase).toHaveBeenCalledWith(adminMock.client, OWN_CASE);
  });

  it("maps each refusal to the code it had before the logic moved out", async () => {
    const expected: [string, number][] = [
      ["engine_unavailable", 503],
      ["already_started", 409],
      ["no_provider_email", 409],
      ["commitment_fee_unpaid", 402],
      ["bill_not_read", 409],
    ];
    for (const [blocked, status] of expected) {
      vi.clearAllMocks();
      serverMock.reset();
      ownedCase();
      startNegotiationForCase.mockResolvedValue({ started: false, blocked });

      const res = await POST(request(), { params });

      expect(res.status, blocked).toBe(status);
      expect(await res.json(), blocked).toHaveProperty("error");
    }
  });

  it("reports a lost link as a 500 rather than leaving the case looking unstarted", async () => {
    // The engine may already be writing to the hospital, so this is a
    // failure the caller can act on, not a silent success.
    ownedCase();
    startNegotiationForCase.mockResolvedValue({
      started: false,
      failed: "link_lost",
      negotiationId: "neg-1",
      cause: "deadlock",
    });

    expect((await POST(request(), { params })).status).toBe(500);
  });

  it("returns 502 when the engine refuses to start", async () => {
    ownedCase();
    startNegotiationForCase.mockResolvedValue({
      started: false,
      failed: "engine_refused",
      cause: new Error("engine down"),
    });

    expect((await POST(request(), { params })).status).toBe(502);
  });
});

describe("GET /api/dashboard/cases/[id]/negotiation", () => {
  it("returns 404 when nothing has been started", async () => {
    ownedCase();

    expect((await GET(request(), { params })).status).toBe(404);
    expect(getNegotiation).not.toHaveBeenCalled();
  });

  it("returns the engine's view of a started negotiation", async () => {
    ownedCase({ ...OWN_CASE, negotiation_id: "neg-1" });
    isBackendConfigured.mockReturnValue(true);
    getNegotiation.mockResolvedValue({ id: "neg-1", status: "awaiting_response" });

    const res = await GET(request(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "neg-1", status: "awaiting_response" });
    expect(getNegotiation).toHaveBeenCalledWith("neg-1");
  });

  it("returns 503 when the engine is not configured", async () => {
    ownedCase({ ...OWN_CASE, negotiation_id: "neg-1" });
    isBackendConfigured.mockReturnValue(false);

    expect((await GET(request(), { params })).status).toBe(503);
    expect(getNegotiation).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's case before asking the engine anything", async () => {
    ownedCase({ ...OWN_CASE, user_id: "other", negotiation_id: "neg-1" });

    expect((await GET(request(), { params })).status).toBe(404);
    expect(getNegotiation).not.toHaveBeenCalled();
  });
});
