import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const refundsCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { refunds: { create: (...args: unknown[]) => refundsCreate(...args) } },
  MIN_CHARGE_CENTS: 50,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown = {}) {
  return new Request("http://localhost/api/admin/payments/rec-1/refund", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeParams(id = "rec-1") {
  return { params: Promise.resolve({ id }) };
}

const CALLER = { id: "admin-1" };
const PAID_RECORD = { id: "rec-1", amount: 100, refunded_amount: 0, status: "paid", processor_ref: "pi_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/payments/[id]/refund", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks can_issue_refunds", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the payment doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: null, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 400 when the payment isn't paid", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: { ...PAID_RECORD, status: "pending" }, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the payment has no processor_ref (e.g. a $0 no-charge success fee)", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: { ...PAID_RECORD, processor_ref: null }, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 when the requested amount exceeds what's left to refund", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: PAID_RECORD, error: null });
    const res = await POST(makeRequest({ amount: 200 }), makeParams());
    expect(res.status).toBe(400);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for a partial refund below Stripe's minimum", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: PAID_RECORD, error: null });
    const res = await POST(makeRequest({ amount: 0.1 }), makeParams());
    expect(res.status).toBe(400);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("defaults to a full refund of the remaining amount when no amount is given", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: { ...PAID_RECORD, amount: 100, refunded_amount: 40 }, error: null });
    serverMock.queueResult("profiles", { data: { name: "Admin Caller" }, error: null });
    refundsCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1", amount: 6000 });
  });

  it("issues a partial refund for the requested amount and logs the activity", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: PAID_RECORD, error: null });
    serverMock.queueResult("profiles", { data: { name: "Admin Caller" }, error: null });
    refundsCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });

    const res = await POST(makeRequest({ amount: 30 }), makeParams());

    expect(res.status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1", amount: 3000 });

    const logInsert = serverMock.from.mock.results.at(-1)!.value.insert as ReturnType<typeof vi.fn>;
    expect(logInsert).toHaveBeenCalledWith({
      actor_id: CALLER.id,
      actor_name: "Admin Caller",
      action: "issued_refund",
      target_id: "rec-1",
      target_name: "$30.00 refund",
    });
  });

  it("returns 500 and does not log when Stripe rejects the refund", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.rpc.mockResolvedValue({ data: true, error: null });
    serverMock.queueResult("payment_records", { data: PAID_RECORD, error: null });
    refundsCreate.mockRejectedValue(new Error("charge already refunded"));

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "charge already refunded" });
  });
});
