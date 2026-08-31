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

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/delete-account", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
  // the cascade's profile lookup (for the deletion-confirmation email),
  // then every empty table lookup it does, default to no rows
  adminMock.queueResult("profiles", { data: { name: "Target User", email: "target@example.com" }, error: null });
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
    sendEmail.mockResolvedValue({ id: "email-1" });

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(200);
    expect(adminMock.deleteUser).toHaveBeenCalledWith("target-1");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "target@example.com", subject: "Your BillFixr account has been deleted" }),
    );
  });

  it("returns 500 and does not hide an Admin API failure", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    adminMock.deleteUser.mockResolvedValue({ error: { message: "auth service unavailable" } });

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still succeeds even if the deletion-confirmation email fails to send", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    adminMock.deleteUser.mockResolvedValue({ error: null });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(makeRequest({ userId: "target-1" }));

    expect(res.status).toBe(200);
  });
});
