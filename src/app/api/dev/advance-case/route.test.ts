import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/dev/advance-case", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/dev/advance-case", () => {
  it("rejects a status not on the allowlist", async () => {
    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid_out_of_band" }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-string caseId", async () => {
    const res = await POST(makeRequest({ caseId: 123, toStatus: "paid" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated user", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the case doesn't belong to the caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: "someone-else" }, error: null });
    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the case doesn't exist at all", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: null, error: null });
    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid" }));
    expect(res.status).toBe(404);
  });

  it("advances the case via the admin client when the caller owns it", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id }, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledWith("cases");
  });

  it("propagates a write failure from the admin client as a 500", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id }, error: null });
    adminMock.queueResult("cases", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest({ caseId: "case-1", toStatus: "paid" }));

    expect(res.status).toBe(500);
  });
});
