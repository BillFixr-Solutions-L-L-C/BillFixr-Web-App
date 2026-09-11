import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/settings/success-fee", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("PATCH /api/admin/settings/success-fee", () => {
  it.each([[-1], [101], ["30"], [null]])("rejects an invalid percentage (%p)", async (percentage) => {
    const res = await PATCH(makeRequest({ percentage }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ percentage: 25 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await PATCH(makeRequest({ percentage: 25 }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full finance domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "none", error: null });
    const res = await PATCH(makeRequest({ percentage: 25 }));
    expect(res.status).toBe(403);
  });

  it("updates the percentage for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("app_settings", { data: null, error: null });

    const res = await PATCH(makeRequest({ percentage: 25 }));

    expect(res.status).toBe(200);
    const updateCall = serverMock.from.mock.results[1].value.update as ReturnType<typeof vi.fn>;
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ success_fee_percentage: 25, updated_by: CALLER.id }));
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("app_settings", { data: null, error: { message: "connection refused" } });

    const res = await PATCH(makeRequest({ percentage: 25 }));

    expect(res.status).toBe(500);
  });
});
