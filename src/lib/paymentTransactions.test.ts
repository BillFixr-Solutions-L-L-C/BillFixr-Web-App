import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseMock } from "@/test/supabaseMock";
import { getPaymentRows as getPaymentRowsReal } from "./paymentTransactions";

// The shared test mock isn't a structurally complete SupabaseClient (it
// only implements the query-builder surface this codebase's routes
// actually use) — cast once here rather than at every call site.
function getPaymentRows(mock: ReturnType<typeof createSupabaseMock>, ...rest: Parameters<typeof getPaymentRowsReal> extends [unknown, ...infer R] ? R : never) {
  return getPaymentRowsReal(mock.client as unknown as SupabaseClient, ...rest);
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    amount: 5,
    status: "paid",
    created_at: "2026-01-01T12:00:00Z",
    card_brand: "visa",
    card_last4: "4242",
    refunded_amount: 0,
    processor_ref: "pi_1",
    profiles: { name: "Test Customer" },
    ...overrides,
  };
}

describe("getPaymentRows", () => {
  it("returns rows and totalCount with no search/status filters", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("payment_records", { data: [makeRow()], error: null, count: 1 });
    mock.queueResult("payment_disputes", { data: [], error: null });

    const { rows, totalCount } = await getPaymentRows(mock, "commitment_fee", {});

    expect(totalCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].customer).toBe("Test Customer");
    expect(rows[0].amount).toBe("$5.00");
  });

  it("looks up matching customers first, then filters payment_records by their ids", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("profiles", { data: [{ id: "user-1" }, { id: "user-2" }], error: null });
    mock.queueResult("payment_records", { data: [makeRow()], error: null, count: 1 });
    mock.queueResult("payment_disputes", { data: [], error: null });

    await getPaymentRows(mock, "commitment_fee", { search: "jane" });

    const profilesBuilder = mock.from.mock.results[0].value;
    expect(profilesBuilder.or).toHaveBeenCalledWith("name.ilike.%jane%,email.ilike.%jane%");

    const paymentRecordsBuilder = mock.from.mock.results[1].value;
    expect(paymentRecordsBuilder.in).toHaveBeenCalledWith("user_id", ["user-1", "user-2"]);
  });

  it("sanitizes commas and parens out of the search term before building the filter", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("profiles", { data: [], error: null });
    mock.queueResult("payment_records", { data: [], error: null, count: 0 });

    await getPaymentRows(mock, "commitment_fee", { search: "Smith, (John)" });

    const profilesBuilder = mock.from.mock.results[0].value;
    expect(profilesBuilder.or).toHaveBeenCalledWith("name.ilike.%Smith John%,email.ilike.%Smith John%");
  });

  it("guards against an empty customer match returning every row instead of none", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("profiles", { data: [], error: null });
    mock.queueResult("payment_records", { data: [], error: null, count: 0 });

    const { rows, totalCount } = await getPaymentRows(mock, "commitment_fee", { search: "nobody" });

    const paymentRecordsBuilder = mock.from.mock.results[1].value;
    expect(paymentRecordsBuilder.eq).toHaveBeenCalledWith("id", "00000000-0000-0000-0000-000000000000");
    expect(rows).toEqual([]);
    expect(totalCount).toBe(0);
  });

  it("filters by status when given", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("payment_records", { data: [], error: null, count: 0 });

    await getPaymentRows(mock, "commitment_fee", { status: "failed" });

    const paymentRecordsBuilder = mock.from.mock.results[0].value;
    expect(paymentRecordsBuilder.eq).toHaveBeenCalledWith("status", "failed");
  });

  it("computes the correct range offset for a later page", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("payment_records", { data: [], error: null, count: 0 });

    await getPaymentRows(mock, "commitment_fee", { limit: 20, page: 3 });

    const paymentRecordsBuilder = mock.from.mock.results[0].value;
    expect(paymentRecordsBuilder.range).toHaveBeenCalledWith(40, 59);
  });

  it("skips the dispute lookup entirely when there are no rows", async () => {
    const mock = createSupabaseMock();
    mock.queueResult("payment_records", { data: [], error: null, count: 0 });

    await getPaymentRows(mock, "commitment_fee", {});

    expect(mock.from).not.toHaveBeenCalledWith("payment_disputes");
  });
});
