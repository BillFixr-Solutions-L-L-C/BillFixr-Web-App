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
  return new Request("http://localhost/api/admin/invite-admin", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CALLER = { id: "admin-1" };
const VALID_BODY = { name: "New Admin", email: "new.admin@example.com", roleId: "role-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/invite-admin", () => {
  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ name: "New Admin" }));
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
    expect(adminMock.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invites the user and promotes their profile to admin with the chosen role", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user-1" } }, error: null });
    adminMock.queueResult("profiles", { data: null, error: null });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(adminMock.inviteUserByEmail).toHaveBeenCalledWith(VALID_BODY.email, { data: { name: VALID_BODY.name } });
  });

  it("returns 500 when the invite itself fails, without touching profiles", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    adminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { message: "already registered" } });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
  });
});
