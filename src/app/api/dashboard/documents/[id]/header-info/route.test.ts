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

const VALID = {
  memberName: "Jane Doe",
  memberId: "M-123",
  group: "G-9",
  claimNumber: "C-55",
  providerName: "General Hospital",
  accountNumber: "A-77",
  serviceDate: "2026-07-14",
  statementDate: "2026-07-20",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/dashboard/documents/bill-1/header-info", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const ANALYZED_BILL = {
  id: "bill-1",
  user_id: USER.id,
  analysis_result: { memberName: "Old", errorsFound: 2, issues: [{ category: "x" }] },
};

function lastAdminUpdate() {
  const builder = adminMock.from.mock.results[0].value as { update: ReturnType<typeof vi.fn> };
  return builder.update.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/dashboard/documents/[id]/header-info", () => {
  it("rejects a missing or non-string field", async () => {
    const { memberName, ...rest } = VALID;
    void memberName;
    expect((await PATCH(makeRequest(rest), { params })).status).toBe(400);
    expect((await PATCH(makeRequest({ ...VALID, group: 5 }), { params })).status).toBe(400);
  });

  it("rejects an over-long field", async () => {
    expect((await PATCH(makeRequest({ ...VALID, memberName: "a".repeat(201) }), { params })).status).toBe(400);
  });

  it("rejects an invalid or impossible date", async () => {
    expect((await PATCH(makeRequest({ ...VALID, serviceDate: "07/14/2026" }), { params })).status).toBe(400);
    expect((await PATCH(makeRequest({ ...VALID, statementDate: "2026-02-31" }), { params })).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...ANALYZED_BILL, user_id: "other" }, error: null });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(404);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("returns 409 when the bill hasn't been analyzed yet", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...ANALYZED_BILL, analysis_result: null }, error: null });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(409);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("writes the columns and merges the analysis fields without dropping the rest", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: ANALYZED_BILL, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await PATCH(makeRequest(VALID), { params });

    expect(res.status).toBe(200);
    expect(lastAdminUpdate()).toEqual({
      provider_name: "General Hospital",
      service_date: "2026-07-14",
      statement_date: "2026-07-20",
      analysis_result: {
        memberName: "Jane Doe",
        memberId: "M-123",
        group: "G-9",
        claimNumber: "C-55",
        accountNumber: "A-77",
        errorsFound: 2,
        issues: [{ category: "x" }],
      },
    });
  });

  it("restores the standard 'not found' text and nulls for cleared fields", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: ANALYZED_BILL, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    await PATCH(
      makeRequest({ ...VALID, memberId: "  ", group: "", providerName: "", serviceDate: "", statementDate: "" }),
      { params },
    );

    const update = lastAdminUpdate();
    expect(update.provider_name).toBeNull();
    expect(update.service_date).toBeNull();
    expect(update.statement_date).toBeNull();
    expect(update.analysis_result.memberId).toBe("No member ID found");
    expect(update.analysis_result.group).toBe("No group found");
  });

  it("returns 500 when the write fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: ANALYZED_BILL, error: null });
    adminMock.queueResult("bills", { data: null, error: { message: "db down" } });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(500);
  });
});
