import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));

const { POST } = await import("./route");

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/auth/record-logout", () => {
  it("stamps the caller's own profile", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.queueResult("profiles", { data: null, error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    const call = adminMock.from.mock.results[0].value;
    expect(call.update).toHaveBeenCalledWith({ last_logout_at: expect.any(String) });
    expect(call.eq).toHaveBeenCalledWith("id", USER.id);
  });

  it("uses the server's clock, not anything the caller could send", async () => {
    // The route reads no body at all, so there is nothing to pass that
    // could backdate a logout or aim it at another account.
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.queueResult("profiles", { data: null, error: null });
    const before = Date.now();

    await POST();

    const [{ last_logout_at }] = adminMock.from.mock.results[0].value.update.mock.calls[0];
    const stamped = new Date(last_logout_at).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it("writes nothing for a caller with no session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("says it failed rather than claiming a logout it did not record", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    adminMock.queueResult("profiles", { data: null, error: { message: "write failed" } });

    const res = await POST();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, recorded: false });
  });
});
