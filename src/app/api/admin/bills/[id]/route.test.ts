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

const { DELETE } = await import("./route");

function makeRequest() {
  return new Request("http://localhost/api/admin/bills/bill-1", { method: "DELETE" });
}

function makeParams(id = "bill-1") {
  return { params: Promise.resolve({ id }) };
}

const CALLER = { id: "admin-1" };
const BILL = { id: "bill-1", filename: "statement.pdf", storage_url: "user-1/statement.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.storageRemove.mockResolvedValue({ data: null, error: null });
});

describe("DELETE /api/admin/bills/[id]", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks can_delete_bills", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: false, error: null });
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("returns 404 when the bill doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: null, error: null });
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 and does not delete anything when the bill already has a case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: BILL, error: null });
    serverMock.queueResult("cases", { data: { id: "case-1" }, error: null });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("returns 409 when the bill has a paid payment record even with no case", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: BILL, error: null });
    serverMock.queueResult("cases", { data: null, error: null });
    serverMock.queueResult("payment_records", { data: { id: "pay-1" }, error: null });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("deletes the bill, its storage file, stale payment records, and logs the activity", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: BILL, error: null });
    serverMock.queueResult("cases", { data: null, error: null });
    serverMock.queueResult("payment_records", { data: null, error: null });
    serverMock.queueResult("profiles", { data: { name: "Admin Caller" }, error: null });
    adminMock.queueResult("payment_records", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(adminMock.storageRemove).toHaveBeenCalledWith(["user-1/statement.pdf"]);

    const logInsert = serverMock.from.mock.results.at(-1)!.value.insert as ReturnType<typeof vi.fn>;
    expect(logInsert).toHaveBeenCalledWith({
      actor_id: CALLER.id,
      actor_name: "Admin Caller",
      action: "deleted_bill",
      target_id: "bill-1",
      target_name: "statement.pdf",
    });
  });

  it("does not fail the whole request if the storage delete fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: BILL, error: null });
    serverMock.queueResult("cases", { data: null, error: null });
    serverMock.queueResult("payment_records", { data: null, error: null });
    serverMock.queueResult("profiles", { data: { name: "Admin Caller" }, error: null });
    adminMock.storageRemove.mockResolvedValue({ data: null, error: { message: "storage unavailable" } });
    adminMock.queueResult("payment_records", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(200);
  });

  it("returns 500 when deleting the bill row fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("bills", { data: BILL, error: null });
    serverMock.queueResult("cases", { data: null, error: null });
    serverMock.queueResult("payment_records", { data: null, error: null });
    adminMock.queueResult("payment_records", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: { message: "db unavailable" } });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(500);
  });
});
