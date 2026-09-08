import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const paymentIntentsCreate = vi.fn();
const paymentIntentsRetrieve = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: (...args: unknown[]) => paymentIntentsCreate(...args),
      retrieve: (...args: unknown[]) => paymentIntentsRetrieve(...args),
    },
  },
  COMMITMENT_FEE_CENTS: 500,
  MIN_CHARGE_CENTS: 50,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/payments/create-intent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
});

describe("POST /api/payments/create-intent", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ type: "commitment_fee", billId: "bill-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an unrecognized type", async () => {
    const res = await POST(makeRequest({ type: "bogus" }));
    expect(res.status).toBe(400);
  });

  describe("commitment_fee", () => {
    it("returns 400 for a non-string billId", async () => {
      const res = await POST(makeRequest({ type: "commitment_fee", billId: 123 }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when the bill doesn't belong to the caller", async () => {
      serverMock.queueResult("bills", { data: { id: "bill-1", user_id: "someone-else" }, error: null });
      const res = await POST(makeRequest({ type: "commitment_fee", billId: "bill-1" }));
      expect(res.status).toBe(404);
    });

    it("creates a new PaymentIntent and payment_records row when none exists", async () => {
      serverMock.queueResult("bills", { data: { id: "bill-1", user_id: USER.id }, error: null });
      adminMock.queueResult("payment_records", { data: null, error: null }); // existing check: none
      paymentIntentsCreate.mockResolvedValue({ id: "pi_new", client_secret: "secret_new" });
      adminMock.queueResult("payment_records", { data: null, error: null }); // insert

      const res = await POST(makeRequest({ type: "commitment_fee", billId: "bill-1" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ clientSecret: "secret_new", intentId: "pi_new", amount: 5 });
      expect(paymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500, currency: "usd" }),
        { idempotencyKey: "commitment_fee:bill-1" },
      );
    });

    it("reuses an existing pending intent instead of creating a new one", async () => {
      serverMock.queueResult("bills", { data: { id: "bill-1", user_id: USER.id }, error: null });
      adminMock.queueResult("payment_records", { data: { processor_ref: "pi_existing", status: "pending" }, error: null });
      paymentIntentsRetrieve.mockResolvedValue({ id: "pi_existing", status: "requires_payment_method", client_secret: "secret_existing", amount: 500 });

      const res = await POST(makeRequest({ type: "commitment_fee", billId: "bill-1" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ clientSecret: "secret_existing", intentId: "pi_existing", amount: 5 });
      expect(paymentIntentsCreate).not.toHaveBeenCalled();
    });

    it("returns alreadyPaid without touching Stripe when the record is already paid", async () => {
      serverMock.queueResult("bills", { data: { id: "bill-1", user_id: USER.id }, error: null });
      adminMock.queueResult("payment_records", { data: { processor_ref: "pi_paid", status: "paid" }, error: null });

      const res = await POST(makeRequest({ type: "commitment_fee", billId: "bill-1" }));

      expect(await res.json()).toEqual({ alreadyPaid: true });
      expect(paymentIntentsRetrieve).not.toHaveBeenCalled();
      expect(paymentIntentsCreate).not.toHaveBeenCalled();
    });
  });

  describe("success_fee", () => {
    it("returns 404 when the case doesn't belong to the caller", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: "someone-else" }, error: null });
      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));
      expect(res.status).toBe(404);
    });

    it("reports no fee owed and inserts nothing when errors_detected is 0", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, errors_detected: 0, savings_found: null }, error: null });
      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));
      expect(await res.json()).toEqual({ noFeeOwed: true });
      expect(adminMock.from).not.toHaveBeenCalled();
    });

    it("returns 409 when errors were found but savings_found isn't known yet", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, errors_detected: 2, savings_found: null }, error: null });
      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));
      expect(res.status).toBe(409);
    });

    it("computes the net amount (gross minus the paid commitment fee) and creates a real intent", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, errors_detected: 2, savings_found: 1000 }, error: null });
      adminMock.queueResult("app_settings", { data: { success_fee_percentage: 30 }, error: null });
      adminMock.queueResult("payment_records", { data: { amount: 5 }, error: null }); // commitment fee already paid
      adminMock.queueResult("payment_records", { data: null, error: null }); // existing success_fee record: none
      paymentIntentsCreate.mockResolvedValue({ id: "pi_success", client_secret: "secret_success" });
      adminMock.queueResult("payment_records", { data: null, error: null }); // insert

      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));
      const body = await res.json();

      // 1000 * 30% = 300, minus the $5 already paid = 295
      expect(body).toEqual({ clientSecret: "secret_success", intentId: "pi_success", amount: 295 });
      expect(paymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 29500 }), { idempotencyKey: "success_fee:case-1" });
    });

    it("marks the record paid directly and completes the case when the net is below Stripe's minimum charge", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, errors_detected: 1, savings_found: 1 }, error: null });
      adminMock.queueResult("app_settings", { data: { success_fee_percentage: 30 }, error: null });
      adminMock.queueResult("payment_records", { data: { amount: 5 }, error: null }); // commitment fee paid
      adminMock.queueResult("payment_records", { data: null, error: null }); // existing: none
      adminMock.queueResult("payment_records", { data: null, error: null }); // the direct paid insert
      adminMock.queueResult("cases", { data: null, error: null }); // case status update to paid

      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));

      expect(await res.json()).toEqual({ noFeeOwed: true });
      expect(paymentIntentsCreate).not.toHaveBeenCalled();
      const insertCall = adminMock.from.mock.results[3].value.insert as ReturnType<typeof vi.fn>;
      expect(insertCall).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", processor_ref: null, amount: 0 }));
    });

    it("defaults to 30% when app_settings has no row somehow", async () => {
      serverMock.queueResult("cases", { data: { id: "case-1", user_id: USER.id, errors_detected: 2, savings_found: 100 }, error: null });
      adminMock.queueResult("app_settings", { data: null, error: null });
      adminMock.queueResult("payment_records", { data: null, error: null }); // no commitment fee paid
      adminMock.queueResult("payment_records", { data: null, error: null }); // existing: none
      paymentIntentsCreate.mockResolvedValue({ id: "pi_default", client_secret: "secret_default" });
      adminMock.queueResult("payment_records", { data: null, error: null });

      const res = await POST(makeRequest({ type: "success_fee", caseId: "case-1" }));
      const body = await res.json();

      // 100 * 30% = 30, no commitment fee paid to net off
      expect(body.amount).toBe(30);
    });
  });
});
