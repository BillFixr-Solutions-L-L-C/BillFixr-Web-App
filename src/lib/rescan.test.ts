import { describe, expect, it } from "vitest";

import { MAX_RESCANS, canRescan, remaining, rescanHintKey, used } from "@/lib/rescan";
import { translate } from "@/lib/i18n/messages";

// One re-scan, set on 2026-11-18.
//
// It was briefly two, on the assumption that a customer would want a
// second look after reading the analysis and the appeal letter together.
// That assumption was never tested in the product: until 2026-11-18 the
// scan started the negotiation in the same request that wrote the
// analysis, so a case was never "analysed and not yet disputed" and the
// button was unreachable at any allowance.
//
// Each re-scan is a real AI read and costs money, which is why there is a
// ceiling. These tests are about that ceiling holding.

describe("the allowance", () => {
  it("is one", () => {
    expect(MAX_RESCANS).toBe(1);
  });

  it("lets a fresh case re-scan", () => {
    expect(canRescan({ rescan_count: 0 })).toBe(true);
    expect(remaining({ rescan_count: 0 })).toBe(1);
  });

  it("stops after one", () => {
    expect(canRescan({ rescan_count: 1 })).toBe(false);
    expect(remaining({ rescan_count: 1 })).toBe(0);
  });

  it("stops above the ceiling, rather than going negative", () => {
    // A count higher than the ceiling -- a case re-scanned twice while
    // the allowance was two -- must not loop back round to "allowed" or
    // report a negative allowance.
    expect(canRescan({ rescan_count: 2 })).toBe(false);
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
  // A key, not a sentence: this module is imported by a server component
  // and an API route, neither of which holds a translator, and the
  // sentence it used to return was English on an otherwise fully
  // translated screen.
  it("says one is available before it is used", () => {
    // Someone who does not know an allowance exists cannot use it.
    expect(rescanHintKey({ rescan_count: 0 })).toBe("rescan.oneLeft");
    expect(translate("en", rescanHintKey({ rescan_count: 0 }))).toMatch(/One re-scan available/i);
  });

  it("says the allowance is spent", () => {
    expect(rescanHintKey({ rescan_count: 1 })).toBe("rescan.noneLeft");
    expect(translate("en", rescanHintKey({ rescan_count: 1 }))).toMatch(/used your re-scan/i);
  });

  it("has Spanish for every hint it can return", () => {
    for (const count of [0, 1, 5]) {
      const key = rescanHintKey({ rescan_count: count });
      expect(translate("es", key), key).not.toBe(translate("en", key));
    }
  });
});
