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
  return new Request("http://localhost/api/dashboard/cases/case-1/send-letter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "case-1" });
const USER = { id: "user-1" };
const OWN_CASE = {
  id: "case-1",
  user_id: USER.id,
  bill_id: "bill-1",
  status: "awaiting_response",
  appeal_letter_text: "Dear Billing,\n\n**Please** review.",
  letter_sent_at: null,
};

function happyPath({ status = "awaiting_response", claimed = [{ id: "case-1" }] } = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("cases", { data: { ...OWN_CASE, status }, error: null });
  serverMock.queueResult("payment_records", { data: { id: "pay-1" }, error: null });
  serverMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com" }, error: null });
  adminMock.queueResult("cases", { data: claimed, error: null });
  sendEmail.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/dashboard/cases/[id]/send-letter", () => {
  it("rejects a missing or malformed provider email", async () => {
    expect((await POST(makeRequest({}), { params })).status).toBe(400);
    expect((await POST(makeRequest({ providerEmail: "not-an-email" }), { params })).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, user_id: "other" }, error: null });
    expect((await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params })).status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 409 when the letter was already sent", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, letter_sent_at: "2026-09-28T10:00:00Z" }, error: null });
    expect((await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params })).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 409 when there is no letter yet", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, appeal_letter_text: null }, error: null });
    expect((await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params })).status).toBe(409);
  });

  it("returns 402 when the commitment fee hasn't been paid", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: OWN_CASE, error: null });
    serverMock.queueResult("payment_records", { data: null, error: null });
    const res = await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params });
    expect(res.status).toBe(402);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the provider with the customer as reply-to, and escapes the letter", async () => {
    happyPath();
    const res = await POST(
      makeRequest({ providerEmail: " billing@hospital.com ", text: "Hi <script>x</script> **bold**" }),
      { params },
    );

    expect(res.status).toBe(200);
    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toBe("billing@hospital.com");
    expect(call.replyTo).toBe("jane@example.com");
    expect(call.html).toContain("&lt;script&gt;");
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("<strong>bold</strong>");
  });

  it("leaves a case that is already awaiting a response at that status (one write: the claim)", async () => {
    happyPath({ status: "awaiting_response" });
    const res = await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params });
    expect(res.status).toBe(200);
    expect(adminMock.from).toHaveBeenCalledTimes(1);
  });

  it("moves a scanning case to awaiting_response as a second write, after the email", async () => {
    happyPath({ status: "scanning" });
    adminMock.queueResult("cases", { data: null, error: null });
    const res = await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params });
    expect(res.status).toBe(200);
    expect(adminMock.from).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.invocationCallOrder[0]).toBeLessThan(adminMock.from.mock.invocationCallOrder[1]);
  });

  it("rolls the claim back and returns 502 when the email fails", async () => {
    happyPath();
    sendEmail.mockRejectedValue(new Error("resend down"));
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params });

    expect(res.status).toBe(502);
    // claim + rollback
    expect(adminMock.from).toHaveBeenCalledTimes(2);
  });

  it("returns 409 and sends nothing when another request already claimed the send", async () => {
    happyPath({ claimed: [] });
    const res = await POST(makeRequest({ providerEmail: "billing@hospital.com" }), { params });
    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
