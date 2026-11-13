import { describe, expect, it } from "vitest";

import { MAX_RESCANS, canRescan, remaining, rescanHint, used } from "@/lib/rescan";

// Raised from one re-scan to two on 2026-11-13, so a customer has a look
// available at the point they want it: after reading the analysis and the
// appeal letter side by side, before pressing Proceed.
//
// Each re-scan is a real AI read and costs money, which is why there is a
// ceiling. These tests are about that ceiling holding.

describe("the allowance", () => {
  it("is two", () => {
    expect(MAX_RESCANS).toBe(2);
  });

  it("lets a fresh case re-scan", () => {
    expect(canRescan({ rescan_count: 0 })).toBe(true);
    expect(remaining({ rescan_count: 0 })).toBe(2);
  });

  it("lets a case that has used one re-scan again", () => {
    // This is the change. One used used to be the end of it.
    expect(canRescan({ rescan_count: 1 })).toBe(true);
    expect(remaining({ rescan_count: 1 })).toBe(1);
  });

  it("stops at two", () => {
    expect(canRescan({ rescan_count: 2 })).toBe(false);
    expect(remaining({ rescan_count: 2 })).toBe(0);
  });

  it("stops above two, rather than going negative", () => {
    // A count higher than the ceiling should not loop back round to
    // "allowed" or report a negative allowance.
    expect(canRescan({ rescan_count: 7 })).toBe(false);
    expect(remaining({ rescan_count: 7 })).toBe(0);
  });

  it("treats a case recorded before the column existed as unused", () => {
    // The migration backfills, but a row read without the column selected
    // arrives as undefined and must not be read as "allowance spent".
    expect(canRescan({})).toBe(true);
    expect(canRescan(null)).toBe(true);
    expect(canRescan({ rescan_count: null })).toBe(true);
    expect(used({ rescan_count: null })).toBe(0);
  });

  it("ignores a count that is not a number", () => {
    expect(used({ rescan_count: "two" as unknown as number })).toBe(0);
    expect(used({ rescan_count: Number.NaN })).toBe(0);
    expect(used({ rescan_count: -3 })).toBe(0);
  });
});

describe("what the customer is told", () => {
  it("says how many are left before any are used", () => {
    // Someone who does not know an allowance exists cannot use it.
    expect(rescanHint({ rescan_count: 0 })).toMatch(/2 re-scans available/i);
  });

  it("says one is left, in the singular", () => {
    expect(rescanHint({ rescan_count: 1 })).toMatch(/One more re-scan/i);
    expect(rescanHint({ rescan_count: 1 })).not.toMatch(/1 re-scans/);
  });

  it("says the allowance is spent", () => {
    expect(rescanHint({ rescan_count: 2 })).toMatch(/used both/i);
  });
});
