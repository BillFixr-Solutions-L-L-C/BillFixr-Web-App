import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/cases/case-1/override", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "case-1" });

const VALID_BODY = {
  decision: "approved",
  notes: "Looks fine",
  overrideReason: "Confirmed by phone",
  approvalChain: "Jane -> Manager",
};

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("PATCH /api/admin/cases/[id]/override", () => {
  it("rejects an invalid decision", async () => {
    const res = await PATCH(makeRequest({ decision: "maybe" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest(VALID_BODY), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await PATCH(makeRequest(VALID_BODY), { params });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full negotiation domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "read_only", error: null });

    const res = await PATCH(makeRequest(VALID_BODY), { params });

    expect(res.status).toBe(403);
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("cases", { data: null, error: { message: "connection refused" } });

    const res = await PATCH(makeRequest(VALID_BODY), { params });

    expect(res.status).toBe(500);
  });

  it("saves the decision and fields for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("cases", { data: null, error: null });

    const res = await PATCH(makeRequest(VALID_BODY), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("stores null for omitted text fields instead of undefined/garbage", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("cases", { data: null, error: null });

    const res = await PATCH(makeRequest({ decision: "rejected" }), { params });

    expect(res.status).toBe(200);
  });
});
