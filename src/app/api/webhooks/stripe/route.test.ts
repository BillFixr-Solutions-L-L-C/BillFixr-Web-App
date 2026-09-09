import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();
const constructEvent = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) } },
}));

const { POST } = await import("./route");

function makeRequest(body: string, signature = "valid-sig") {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

function makeEvent(type: string, object: unknown, id = "evt_1") {
  return { id, type, data: { object } };
}

// The dedupe insert every non-deduped test needs to succeed - queued
// explicitly per test (not in a shared beforeEach) since this mock's
// per-table queues are FIFO and persist across tests in this file; a
// global default queued in beforeEach would double up with any test that
// also queues its own "stripe_events" result for the same table.
function queueDedupeOk() {
  adminMock.queueResult("stripe_events", { data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when the signature doesn't verify", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("deduplicates an already-processed event without touching payment_records", async () => {
    const event = makeEvent("payment_intent.succeeded", { id: "pi_1" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("stripe_events", { data: null, error: { message: "duplicate key", code: "23505" } });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(adminMock.from).toHaveBeenCalledTimes(1); // only the stripe_events insert
  });

  it("logs and returns ok when no matching payment_records row exists", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_missing" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: null, error: null });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does nothing when the record is already marked paid", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_1" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: { id: "rec-1", type: "commitment_fee", bill_id: "bill-1", status: "paid" }, error: null });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledTimes(2); // stripe_events insert + the lookup, no update
  });

  it("marks the record paid and creates a case for a commitment_fee success", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_1" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: { id: "rec-1", type: "commitment_fee", bill_id: "bill-1", status: "pending" }, error: null }); // lookup
    adminMock.queueResult("payment_records", { data: null, error: null }); // status update to paid
    adminMock.queueResult("cases", { data: null, error: null }); // no existing case
    adminMock.queueResult("bills", { data: { user_id: "user-1" }, error: null });
    adminMock.queueResult("cases", { data: { id: "case-new" }, error: null }); // insert
    adminMock.queueResult("payment_records", { data: null, error: null }); // backfill case_id

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    // Calls in order: stripe_events, payment_records(lookup), payment_records(update),
    // cases(check existing), bills(get user), cases(insert) <- index 5
    const caseInsert = adminMock.from.mock.results[5].value.insert as ReturnType<typeof vi.fn>;
    expect(caseInsert).toHaveBeenCalledWith({ bill_id: "bill-1", user_id: "user-1", status: "scanning" });
  });

  it("does not create a second case if one already exists for the bill", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_1" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: { id: "rec-1", type: "commitment_fee", bill_id: "bill-1", status: "pending" }, error: null });
    adminMock.queueResult("payment_records", { data: null, error: null }); // status update
    adminMock.queueResult("cases", { data: { id: "existing-case" }, error: null }); // already exists

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledTimes(4); // stripe_events, lookup, update, cases-check - stops there
  });

  it("completes the case for a success_fee success", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_2" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: { id: "rec-2", type: "success_fee", case_id: "case-1", status: "pending" }, error: null });
    adminMock.queueResult("payment_records", { data: null, error: null }); // status update to paid
    adminMock.queueResult("cases", { data: null, error: null }); // case status update to paid

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    // stripe_events, payment_records(lookup), payment_records(update), cases(update) <- index 3
    const caseUpdate = adminMock.from.mock.results[3].value.update as ReturnType<typeof vi.fn>;
    expect(caseUpdate).toHaveBeenCalledWith({ status: "paid" });
  });

  it("marks the record failed on payment_intent.payment_failed", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.payment_failed", { id: "pi_3" });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: null, error: null });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    // stripe_events, payment_records(update) <- index 1
    const update = adminMock.from.mock.results[1].value.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledWith({ status: "failed" });
  });

  it("is a no-op for an unrelated event type", async () => {
    queueDedupeOk();
    const event = makeEvent("customer.created", { id: "cus_1" });
    constructEvent.mockReturnValue(event);

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledTimes(1); // only the dedupe insert
  });

  it("records the cumulative refunded amount on charge.refunded", async () => {
    queueDedupeOk();
    const event = makeEvent("charge.refunded", { payment_intent: "pi_1", amount_refunded: 3000 });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: null, error: null });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    // stripe_events, payment_records(update) <- index 1
    const update = adminMock.from.mock.results[1].value.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledWith({ refunded_amount: 30 });
  });

  it("is a no-op for charge.refunded with no string payment_intent", async () => {
    queueDedupeOk();
    const event = makeEvent("charge.refunded", { payment_intent: null, amount_refunded: 3000 });
    constructEvent.mockReturnValue(event);

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledTimes(1); // only the dedupe insert
  });

  it("upserts a dispute row keyed on the matching payment_records row", async () => {
    queueDedupeOk();
    const event = makeEvent("charge.dispute.created", {
      id: "dp_1",
      payment_intent: "pi_1",
      amount: 500,
      reason: "fraudulent",
      status: "needs_response",
    });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: { id: "rec-1" }, error: null });
    adminMock.queueResult("payment_disputes", { data: null, error: null });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    // stripe_events, payment_records(lookup), payment_disputes(upsert) <- index 2
    const upsert = adminMock.from.mock.results[2].value.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_record_id: "rec-1",
        stripe_dispute_id: "dp_1",
        amount: 5,
        reason: "fraudulent",
        status: "needs_response",
      }),
      { onConflict: "stripe_dispute_id" },
    );
  });

  it("logs and does nothing for a dispute with no matching payment_records row", async () => {
    queueDedupeOk();
    const event = makeEvent("charge.dispute.updated", {
      id: "dp_2",
      payment_intent: "pi_missing",
      amount: 500,
      reason: "fraudulent",
      status: "under_review",
    });
    constructEvent.mockReturnValue(event);
    adminMock.queueResult("payment_records", { data: null, error: null });

    const res = await POST(makeRequest("{}"));

    expect(await res.json()).toEqual({ ok: true });
    expect(adminMock.from).toHaveBeenCalledTimes(2); // stripe_events, payment_records lookup only
  });

  it("still returns 200 when the handler throws internally", async () => {
    queueDedupeOk();
    const event = makeEvent("payment_intent.succeeded", { id: "pi_err" });
    constructEvent.mockReturnValue(event);
    // First from() call is the dedupe insert (outside the try/catch, must
    // succeed normally); the second is handleSucceeded's own lookup,
    // which this makes throw to exercise the try/catch around it.
    let call = 0;
    const originalFrom = adminMock.from.getMockImplementation()!;
    adminMock.from.mockImplementation((table: string) => {
      call += 1;
      if (call === 2) throw new Error("lookup boom");
      return originalFrom(table);
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
  });
});
