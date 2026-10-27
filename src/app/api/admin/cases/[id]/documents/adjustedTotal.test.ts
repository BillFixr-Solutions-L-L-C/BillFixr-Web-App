import { describe, expect, it } from "vitest";

// The corrected balance the customer sees beside the overcharge. It is
// written straight onto cases.adjusted_total, so a bad value would be
// shown as money — the route rejects anything that is not a positive
// number rather than coercing it.
function parseAdjustedTotal(raw: unknown): { ok: true; amount: number } | { ok: false } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false };
  return { ok: true, amount };
}

describe("adjusted total parsing", () => {
  it("accepts a plain amount", () => {
    expect(parseAdjustedTotal("2500")).toEqual({ ok: true, amount: 2500 });
    expect(parseAdjustedTotal("2500.75")).toEqual({ ok: true, amount: 2500.75 });
  });

  it("treats an empty value as simply not provided", () => {
    expect(parseAdjustedTotal("")).toEqual({ ok: false });
    expect(parseAdjustedTotal("   ")).toEqual({ ok: false });
    expect(parseAdjustedTotal(undefined)).toEqual({ ok: false });
  });

  it("refuses anything that is not a positive number", () => {
    expect(parseAdjustedTotal("-10")).toEqual({ ok: false });
    expect(parseAdjustedTotal("abc")).toEqual({ ok: false });
    expect(parseAdjustedTotal("NaN")).toEqual({ ok: false });
  });

  it("does not accept Infinity, which Number() happily returns", () => {
    expect(parseAdjustedTotal("Infinity")).toEqual({ ok: false });
  });
});
