import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { GET } = await import("./route");

function makeRequest(query: string) {
  return new Request(`http://localhost/api/payments/status${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/payments/status", () => {
  it("returns 400 when intentId is missing", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest("?intentId=pi_1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no payment_records row matches (including another user's, filtered out by RLS)", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("payment_records", { data: null, error: null });
    const res = await GET(makeRequest("?intentId=pi_1"));
    expect(res.status).toBe(404);
  });

  it("returns the status and caseId for the caller's own record", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("payment_records", { data: { status: "paid", case_id: "case-1" }, error: null });
    const res = await GET(makeRequest("?intentId=pi_1"));
    expect(await res.json()).toEqual({ status: "paid", caseId: "case-1" });
  });
});
