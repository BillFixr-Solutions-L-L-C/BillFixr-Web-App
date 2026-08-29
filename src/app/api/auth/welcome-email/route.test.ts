import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/welcome-email", () => {
  it("returns 401 when there is no authenticated user", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the profile doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", { data: null, error: null });
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("does not resend when welcome_email_sent_at is already set", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: "2026-08-29T00:00:00Z" },
      error: null,
    });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadySent: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the welcome email and marks it sent on first call", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: null },
      error: null,
    });
    sendEmail.mockResolvedValue({ id: "email-1" });
    serverMock.queueResult("profiles", { data: null, error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", subject: "Welcome to BillFixr" }),
    );
  });

  it("returns 500 without setting the flag when the send fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: null },
      error: null,
    });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST();

    expect(res.status).toBe(500);
  });
});
