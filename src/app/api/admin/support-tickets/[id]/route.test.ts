import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/support-tickets/ticket-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "ticket-1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/admin/support-tickets/[id]", () => {
  it("rejects an invalid status", async () => {
    const res = await PATCH(makeRequest({ status: "open" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ status: "resolved" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await PATCH(makeRequest({ status: "resolved" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: null, error: { message: "connection refused" } });

    const res = await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(res.status).toBe(500);
  });

  it("updates the status and emails the customer for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: { subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } },
      error: null,
    });

    const res = await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
  });

  it("still returns ok when the notification email fails to send", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: { subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } },
      error: null,
    });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await PATCH(makeRequest({ status: "in_progress" }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
