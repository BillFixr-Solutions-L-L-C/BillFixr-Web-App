import { describe, expect, it, vi } from "vitest";

import { syncSettlementFigures } from "@/lib/settlementFigures";

// The engine's view of the first real settlement, from production on
// 2026-11-13: $1,818.13 billed, $428.53 left to the patient after
// insurance, hospital agreed $112.49.
const SETTLED = { total_billed: 1818.13, original_balance_due: 428.53, settled_amount: 112.49 };

function admin({ feePaid = false }: { feePaid?: boolean } = {}) {
  const update = vi.fn();
  const client = {
    from(table: string) {
      if (table === "cases") {
        return {
          update(values: Record<string, unknown>) {
            update(values);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      // payment_records
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: feePaid ? { id: "pay-1" } : null }),
      };
      return chain;
    },
  };
  return { client: client as never, update };
}

const CASE = { id: "case-1", savings_found: null, adjusted_total: null };

describe("syncSettlementFigures", () => {
  it("writes the reduction the provider agreed to", async () => {
    const { client, update } = admin();

    const result = await syncSettlementFigures(client, CASE, SETTLED);

    expect(result).toEqual({ written: true, figures: { savingsFound: 316.04, adjustedTotal: 112.49 } });
    expect(update).toHaveBeenCalledWith({ savings_found: 316.04, adjusted_total: 112.49 });
  });

  it("does not write the gross bill as the saving", async () => {
    // $1,705.64 is total_billed - settled_amount, and at 20% it would
    // invoice $341 against a $316 reduction.
    const { update } = admin();
    await syncSettlementFigures(admin().client, CASE, SETTLED);

    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ savings_found: 1705.64 }));
  });

  it("leaves the case alone until there is a settlement", async () => {
    const { client, update } = admin();

    const result = await syncSettlementFigures(client, CASE, { ...SETTLED, settled_amount: null });

    expect(result).toEqual({ written: false, reason: "no_settlement" });
    expect(update).not.toHaveBeenCalled();
  });

  it("writes nothing when the settlement is not a reduction", async () => {
    // Settled at more than the patient owed. A zero or negative here
    // would turn into a success fee charged on nothing.
    const { client, update } = admin();

    const result = await syncSettlementFigures(client, CASE, { ...SETTLED, settled_amount: 500 });

    expect(result).toEqual({ written: false, reason: "no_reduction" });
    expect(update).not.toHaveBeenCalled();
  });

  it("never moves the basis of a fee that has already been charged", async () => {
    // The customer holds a receipt computed from the old figure. A
    // revised settlement is fixed with a refund, in the open, not by a
    // column changing underneath it.
    const { client, update } = admin({ feePaid: true });

    const result = await syncSettlementFigures(client, CASE, SETTLED);

    expect(result).toEqual({ written: false, reason: "fee_already_charged" });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not rewrite figures that already match", async () => {
    const { client, update } = admin();

    const result = await syncSettlementFigures(
      client,
      { id: "case-1", savings_found: 316.04, adjusted_total: 112.49 },
      SETTLED,
    );

    expect(result).toEqual({ written: false, reason: "unchanged" });
    expect(update).not.toHaveBeenCalled();
  });

  it("corrects a case still carrying the audit's estimate", async () => {
    // What every settled case in production is holding right now: the
    // estimate made before anyone wrote to the provider.
    const { client, update } = admin();

    const result = await syncSettlementFigures(
      client,
      { id: "case-1", savings_found: 278.54, adjusted_total: null },
      SETTLED,
    );

    expect(result).toEqual({ written: true, figures: { savingsFound: 316.04, adjustedTotal: 112.49 } });
    expect(update).toHaveBeenCalledWith({ savings_found: 316.04, adjusted_total: 112.49 });
  });

  it("falls back to the gross bill only when no patient balance was recorded", async () => {
    const { client, update } = admin();

    await syncSettlementFigures(client, CASE, {
      total_billed: 10000,
      original_balance_due: null,
      settled_amount: 7000,
    });

    expect(update).toHaveBeenCalledWith({ savings_found: 3000, adjusted_total: 7000 });
  });
});
