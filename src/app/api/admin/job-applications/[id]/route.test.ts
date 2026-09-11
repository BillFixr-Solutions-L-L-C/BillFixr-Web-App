import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/job-applications/application-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "application-1" });

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("PATCH /api/admin/job-applications/[id]", () => {
  it("rejects an invalid status", async () => {
    const res = await PATCH(makeRequest({ status: "received" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ status: "reviewed" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await PATCH(makeRequest({ status: "reviewed" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full hr domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "none", error: null });

    const res = await PATCH(makeRequest({ status: "reviewed" }), { params });

    expect(res.status).toBe(403);
  });

  it("marks an application reviewed for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("job_applications", { data: null, error: null });

    const res = await PATCH(makeRequest({ status: "reviewed" }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("job_applications", { data: null, error: { message: "connection refused" } });

    const res = await PATCH(makeRequest({ status: "reviewed" }), { params });

    expect(res.status).toBe(500);
  });
});
