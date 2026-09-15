import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/support-tickets/ticket-1/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "ticket-1" });

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("POST /api/admin/support-tickets/[id]/chat", () => {
  it("rejects a whitespace-only message", async () => {
    const res = await POST(makeRequest({ text: "   " }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ text: "hi" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await POST(makeRequest({ text: "hi" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full client_data domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "limited", error: null });

    const res = await POST(makeRequest({ text: "hi" }), { params });

    expect(res.status).toBe(403);
  });

  it("returns 404 when the ticket doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: null, error: null });

    const res = await POST(makeRequest({ text: "hi" }), { params });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the ticket has been resolved", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1", status: "resolved" }, error: null });

    const res = await POST(makeRequest({ text: "hi" }), { params });

    expect(res.status).toBe(409);
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1" }, error: null });
    serverMock.queueResult("chat_messages", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest({ text: "hi" }), { params });

    expect(res.status).toBe(500);
  });

  it("inserts the trimmed reply as an agent message", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1" }, error: null });
    serverMock.queueResult("chat_messages", { data: null, error: null });

    const res = await POST(makeRequest({ text: "  hi there  " }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const insert = serverMock.from.mock.results[2].value.insert as ReturnType<typeof vi.fn>;
    expect(insert).toHaveBeenCalledWith({ ticket_id: "ticket-1", from: "agent", text: "hi there" });
  });
});
