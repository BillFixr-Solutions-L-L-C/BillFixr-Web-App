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
  return new Request("http://localhost/api/admin/resend-invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("POST /api/admin/resend-invite", () => {
  it("rejects a non-string userId", async () => {
    const res = await POST(makeRequest({ userId: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full system domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "read_only", error: null });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the target profile doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: null, error: null });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(404);
  });

  it("resends the invite to the target's real email and logs the activity", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin", name: "Existing Admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Pending Admin", email: "pending.admin@example.com" }, error: null });
    adminMock.inviteUserByEmail.mockResolvedValue({ data: {}, error: null });

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(200);
    expect(adminMock.inviteUserByEmail).toHaveBeenCalledWith("pending.admin@example.com");

    const logInsert = serverMock.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    expect(logInsert).toHaveBeenCalledWith({
      actor_id: CALLER.id,
      actor_name: "Existing Admin",
      action: "resent_invite",
      target_id: "target-1",
      target_name: "Pending Admin",
    });
  });
});
