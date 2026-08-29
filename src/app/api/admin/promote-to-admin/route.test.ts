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
  return new Request("http://localhost/api/admin/promote-to-admin", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };
const VALID_BODY = { userId: "customer-1", roleId: "role-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/promote-to-admin", () => {
  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ userId: "customer-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the target account doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: null, error: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the target is already an admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com", role: "admin" }, error: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the role doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com", role: "customer" }, error: null });
    adminMock.queueResult("roles", { data: null, error: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("promotes the account and emails the person their new role", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com", role: "customer" }, error: null });
    adminMock.queueResult("roles", { data: { name: "Support Admin" }, error: null });
    adminMock.queueResult("profiles", { data: null, error: null }); // the role-grant update
    sendEmail.mockResolvedValue({ id: "email-1" });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", subject: "Welcome to your new role: Support Admin" }),
    );
  });

  it("still succeeds even if the notification email fails to send", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com", role: "customer" }, error: null });
    adminMock.queueResult("roles", { data: { name: "Support Admin" }, error: null });
    adminMock.queueResult("profiles", { data: null, error: null });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
  });

  it("returns 500 without emailing when the profile update fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com", role: "customer" }, error: null });
    adminMock.queueResult("roles", { data: { name: "Support Admin" }, error: null });
    adminMock.queueResult("profiles", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
