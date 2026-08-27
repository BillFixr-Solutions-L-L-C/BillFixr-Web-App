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
  return new Request("http://localhost/api/admin/delete-account", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
  // every empty table lookup used by the cascade cleanup defaults to no rows
  for (const table of ["cases", "support_tickets", "chat_messages", "communication_logs", "follow_ups", "payment_records", "notifications", "testimonials", "bills"]) {
    adminMock.queueResult(table, { data: [], error: null });
  }
});

describe("POST /api/admin/delete-account", () => {
  it("rejects a non-string userId", async () => {
    const res = await POST(makeRequest({ userId: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks can_delete_accounts", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(makeRequest({ userId: "target-1" }));
    expect(res.status).toBe(403);
    expect(adminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses to let a caller delete their own account", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    const res = await POST(makeRequest({ userId: CALLER.id }));
    expect(res.status).toBe(400);
    expect(adminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the auth user once authorized, for a different target account", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    adminMock.deleteUser.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(200);
    expect(adminMock.deleteUser).toHaveBeenCalledWith("target-1");
  });

  it("returns 500 and does not hide an Admin API failure", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    adminMock.deleteUser.mockResolvedValue({ error: { message: "auth service unavailable" } });

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(500);
  });
});
