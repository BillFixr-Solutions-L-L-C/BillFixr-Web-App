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
  return new Request("http://localhost/api/dashboard/chat/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/dashboard/chat/send", () => {
  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ ticketId: "ticket-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects a whitespace-only message", async () => {
    const res = await POST(makeRequest({ ticketId: "ticket-1", text: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated user", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ ticketId: "ticket-1", text: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the ticket doesn't belong to the caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1", user_id: "someone-else" }, error: null });
    const res = await POST(makeRequest({ ticketId: "ticket-1", text: "hi" }));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the user-message insert fails, without inserting the canned reply", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1", user_id: USER.id }, error: null });
    serverMock.queueResult("chat_messages", { data: null, error: { message: "db exploded" } });

    const res = await POST(makeRequest({ ticketId: "ticket-1", text: "hi" }));

    expect(res.status).toBe(500);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("inserts the trimmed user message via the session client and the canned reply via the admin client", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("support_tickets", { data: { id: "ticket-1", user_id: USER.id }, error: null });
    serverMock.queueResult("chat_messages", { data: null, error: null });
    adminMock.queueResult("chat_messages", { data: null, error: null });

    const res = await POST(makeRequest({ ticketId: "ticket-1", text: "  hi there  " }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const userInsert = serverMock.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    expect(userInsert).toHaveBeenCalledWith({ ticket_id: "ticket-1", from: "user", text: "hi there" });

    const agentInsert = adminMock.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>;
    expect(agentInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: "ticket-1", from: "agent" }),
    );
  });
});
