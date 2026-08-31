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

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const table of ["cases", "support_tickets", "chat_messages", "communication_logs", "follow_ups", "payment_records", "notifications", "testimonials", "bills"]) {
    adminMock.queueResult(table, { data: [], error: null });
  }
});

describe("POST /api/account/delete", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(adminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the caller's own account, no permission check needed", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.deleteUser.mockResolvedValue({ error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(adminMock.deleteUser).toHaveBeenCalledWith(USER.id);
    // no can_delete_accounts / role check for a self-delete
    expect(serverMock.rpc).not.toHaveBeenCalled();
  });

  it("returns 500 when the Admin API deletion fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.deleteUser.mockResolvedValue({ error: { message: "auth service unavailable" } });

    const res = await POST();

    expect(res.status).toBe(500);
  });
});
