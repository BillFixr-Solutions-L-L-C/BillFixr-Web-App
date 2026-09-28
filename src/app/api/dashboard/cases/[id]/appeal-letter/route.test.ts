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

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/dashboard/cases/case-1/appeal-letter", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "case-1" });
const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/dashboard/cases/[id]/appeal-letter", () => {
  it("rejects empty or non-string text", async () => {
    expect((await PATCH(makeRequest({ text: "   " }), { params })).status).toBe(400);
    expect((await PATCH(makeRequest({ text: 5 }), { params })).status).toBe(400);
  });

  it("rejects an oversized letter", async () => {
    const res = await PATCH(makeRequest({ text: "a".repeat(20001) }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(makeRequest({ text: "hi" }), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: "other", letter_sent_at: null }, error: null });
    expect((await PATCH(makeRequest({ text: "hi" }), { params })).status).toBe(404);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("refuses to edit a letter that was already sent", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", {
      data: { id: "case-1", user_id: USER.id, letter_sent_at: "2026-09-28T10:00:00Z" },
      error: null,
    });
    expect((await PATCH(makeRequest({ text: "hi" }), { params })).status).toBe(409);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("saves the letter with the service role for the owner", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, letter_sent_at: null }, error: null });
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await PATCH(makeRequest({ text: "Dear Billing," }), { params });

    expect(res.status).toBe(200);
    expect(adminMock.from).toHaveBeenCalledWith("cases");
  });

  it("returns 500 when the write fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, letter_sent_at: null }, error: null });
    adminMock.queueResult("cases", { data: null, error: { message: "db down" } });
    expect((await PATCH(makeRequest({ text: "hi" }), { params })).status).toBe(500);
  });
});
