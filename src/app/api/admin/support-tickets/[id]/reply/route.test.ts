import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "ticket-1" });
const ADMIN = { id: "admin-1" };
const TICKET = { id: "ticket-1", subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } };

function req(body: unknown) {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}
function allowAdmin() {
  serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
  serverMock.queueResult("profiles", { data: { role: "admin", name: "Agent" }, error: null });
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
});

describe("POST /api/admin/support-tickets/[id]/reply", () => {
  it("rejects an empty or over-long message", async () => {
    expect((await POST(req({ message: "   " }), { params })).status).toBe(400);
    expect((await POST(req({ message: "a".repeat(5001) }), { params })).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ message: "hi" }), { params })).status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    expect((await POST(req({ message: "hi" }), { params })).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin without full client_data access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "read_only", error: null });
    expect((await POST(req({ message: "hi" }), { params })).status).toBe(403);
  });

  it("returns 404 when the ticket doesn't exist", async () => {
    allowAdmin();
    serverMock.queueResult("support_tickets", { data: null, error: null });
    expect((await POST(req({ message: "hi" }), { params })).status).toBe(404);
  });

  it("emails the customer, replying to the support inbox", async () => {
    allowAdmin();
    serverMock.queueResult("support_tickets", { data: TICKET, error: null });
    sendEmail.mockResolvedValue({});

    const res = await POST(req({ message: "We've refunded it.\nThanks for waiting." }), { params });

    expect(res.status).toBe(200);
    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toBe("jane@example.com");
    expect(call.subject).toBe("Re: Payment issue");
    expect(call.replyTo).toBe("support@billfixr.com");
    expect(call.html).toContain("We&#39;ve refunded it.<br>Thanks for waiting.");
  });

  it("escapes the agent's message", async () => {
    allowAdmin();
    serverMock.queueResult("support_tickets", { data: TICKET, error: null });
    sendEmail.mockResolvedValue({});

    await POST(req({ message: "<script>alert(1)</script>" }), { params });

    const call = sendEmail.mock.calls[0][0];
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("&lt;script&gt;");
  });

  it("reports a send failure rather than claiming it sent", async () => {
    allowAdmin();
    serverMock.queueResult("support_tickets", { data: TICKET, error: null });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(req({ message: "hi" }), { params });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/couldn't send/i);
  });

  it("refuses when the customer has no email on file", async () => {
    allowAdmin();
    serverMock.queueResult("support_tickets", { data: { ...TICKET, profiles: { name: "Jane", email: null } }, error: null });
    expect((await POST(req({ message: "hi" }), { params })).status).toBe(409);
  });
});
