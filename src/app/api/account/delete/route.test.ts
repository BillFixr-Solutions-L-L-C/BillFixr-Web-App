import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.queueResult("profiles", { data: { name: "Jane Doe", email: "jane@example.com" }, error: null });
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
    sendEmail.mockResolvedValue({ id: "email-1" });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(adminMock.deleteUser).toHaveBeenCalledWith(USER.id);
    // no can_delete_accounts / role check for a self-delete
    expect(serverMock.rpc).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", subject: "Your BillFixr account has been deleted" }),
    );
  });

  it("returns 500 when the Admin API deletion fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.deleteUser.mockResolvedValue({ error: { message: "auth service unavailable" } });

    const res = await POST();

    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
