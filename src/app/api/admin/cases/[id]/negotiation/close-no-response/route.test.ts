import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const closeForNoResponse = vi.fn();
const getNegotiation = vi.fn();
const isBackendConfigured = vi.fn();
const getDomainAccess = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
}));
// The real module behind the stubs, so AutomationEngineError and
// providerHasResponded behave exactly as they do in production.
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  closeForNoResponse: (...a: unknown[]) => closeForNoResponse(...a),
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
}));

const { POST } = await import("./route");
const { AutomationEngineError } = await import("@/lib/automation-engine");

const params = Promise.resolve({ id: "case-1" });
const request = (body?: unknown) =>
  new Request("http://localhost/api/admin/cases/case-1/negotiation/close-no-response", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ADMIN = { id: "admin-1" };

/** The state in which closing is legitimate: three follow-ups out, silence. */
function exhausted(overrides: Record<string, unknown> = {}) {
  return { id: "neg-1", status: "FOLLOW_UP_SENT", cadence_step: 3, ...overrides };
}

function adminCaller({
  role = "admin",
  access = "full",
  negotiationId = "neg-1" as string | null,
  caseStatus = "awaiting_response",
} = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
  serverMock.queueResult("profiles", { data: { role }, error: null });
  getDomainAccess.mockResolvedValue(access);
  isBackendConfigured.mockReturnValue(true);
  serverMock.queueResult("cases", {
    data: { id: "case-1", user_id: "user-1", status: caseStatus, negotiation_id: negotiationId },
    error: null,
  });
}

/** Calls to a chain method across every builder the route made. */
function callsTo(method: string): unknown[][] {
  return adminMock.from.mock.results.flatMap((result) => {
    const builder = result.value as Record<string, { mock?: { calls: unknown[][] } }>;
    return builder?.[method]?.mock?.calls ?? [];
  });
}

function caseClosesCleanly() {
  adminMock.queueResult("cases", { data: [{ id: "case-1" }], error: null });
  adminMock.queueResult("profiles", { data: { name: "Jordan", email: "jordan@example.com" }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  closeForNoResponse.mockResolvedValue({ id: "neg-1", status: "CLOSED_NO_RESPONSE" });
  sendEmail.mockResolvedValue(undefined);
});

describe("POST /api/admin/cases/[id]/negotiation/close-no-response", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(), { params })).status).toBe(401);
    expect(closeForNoResponse).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    adminCaller({ role: "customer" });
    expect((await POST(request(), { params })).status).toBe(403);
    expect(closeForNoResponse).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin without full negotiation access", async () => {
    // Closing ends the client's negotiation, so read-only access to the
    // domain is not enough.
    adminCaller({ access: "read" });
    expect((await POST(request(), { params })).status).toBe(403);
    expect(closeForNoResponse).not.toHaveBeenCalled();
  });

  it("closes the case, marks it closed and tells the customer", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    caseClosesCleanly();

    const res = await POST(request({ reason: "No reply after three follow-ups." }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(closeForNoResponse).toHaveBeenCalledWith("neg-1", "No reply after three follow-ups.");
    expect(body.alreadyClosed).toBe(false);
    expect(body.emailed).toBe(true);
    expect(body.followUpsSent).toBe(3);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "jordan@example.com" });
  });

  it("refuses to close a case the provider has answered", async () => {
    // Otherwise we would tell a customer their provider ignored them when
    // it had not. The engine applies no guard of its own.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted({ status: "COUNTER_OFFER_RECEIVED" }));

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("has responded");
    expect(closeForNoResponse).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses to close before all three follow-ups have gone out", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted({ cadence_step: 1 }));

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("1 of 3");
    expect(body.followUpsSent).toBe(1);
    expect(closeForNoResponse).not.toHaveBeenCalled();
  });

  it("treats a missing cadence_step as zero follow-ups, not as exhausted", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue({ id: "neg-1", status: "DISPUTE_SENT" });

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).followUpsSent).toBe(0);
    expect(closeForNoResponse).not.toHaveBeenCalled();
  });

  it("only closes the row that is still in the status we read", async () => {
    // Without this condition two concurrent closes both match, both
    // "succeed", and both email the customer. The mock ignores chain
    // arguments, so the guard has to be asserted on the call.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    caseClosesCleanly();

    await POST(request(), { params });

    expect(callsTo("eq")).toEqual(
      expect.arrayContaining([
        ["id", "case-1"],
        ["status", "awaiting_response"],
      ]),
    );
  });

  it("checks the engine's live view, not our cached case row", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    caseClosesCleanly();

    await POST(request(), { params });

    expect(getNegotiation).toHaveBeenCalledWith("neg-1");
  });

  it("returns 409 when no negotiation was ever started", async () => {
    adminCaller({ negotiationId: null });
    expect((await POST(request(), { params })).status).toBe(409);
    expect(getNegotiation).not.toHaveBeenCalled();
  });

  it("returns 409 on a case that is already finished", async () => {
    adminCaller({ caseStatus: "paid" });
    const res = await POST(request(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already finished");
    expect(getNegotiation).not.toHaveBeenCalled();
  });

  it("emails once even if two admins close at the same time", async () => {
    // The status update is conditional on the status we read, so the loser
    // matches no row and must not send a second email.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    adminMock.queueResult("cases", { data: [], error: null });
    // Queued deliberately: a reachable email address is what makes this
    // test able to fail. Without it no email is possible either way and
    // the guard goes untested.
    adminMock.queueResult("profiles", { data: { name: "Jordan", email: "jordan@example.com" }, error: null });

    const body = await (await POST(request(), { params })).json();

    expect(body.alreadyClosed).toBe(true);
    expect(body.emailed).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still reports success when the customer email fails", async () => {
    // The case is closed either way; not telling them is a log line, not a
    // failure of a completed action.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    caseClosesCleanly();
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(false);
  });

  it("reports loudly when the engine closed but our status did not update", async () => {
    // The two sides now disagree and there is no retry that fixes it, so
    // this must not look like a success.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    adminMock.queueResult("cases", { data: null, error: { message: "deadlock" } });

    const res = await POST(request(), { params });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("re-check this case");
  });

  it("passes the engine's 404 through as a 409", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    closeForNoResponse.mockRejectedValue(new AutomationEngineError("gone", 404, "not found"));

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("no record");
  });

  it("does not leak the engine's error text on a failure", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    closeForNoResponse.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.4:8000"));

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("10.0.0.4");
  });

  it("works with no request body at all", async () => {
    // The reason is optional and the engine has its own default, so an
    // empty POST must not be a 400.
    adminCaller();
    getNegotiation.mockResolvedValue(exhausted());
    caseClosesCleanly();

    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    expect(closeForNoResponse).toHaveBeenCalledWith("neg-1", undefined);
  });

  it("returns 503 when the engine is not configured", async () => {
    adminCaller();
    isBackendConfigured.mockReturnValue(false);
    expect((await POST(request(), { params })).status).toBe(503);
  });
});
