import { describe, expect, it } from "vitest";

import {
  PAYMENT_FAILED,
  PAYMENT_STILL_CONFIRMING,
  PAYMENT_TAKEN_BUT_NO_CASE,
  stepAfterPayment,
} from "@/lib/postPaymentStep";

describe("stepAfterPayment", () => {
  it("goes to scanning with the case id the poll returned", () => {
    expect(stepAfterPayment({ status: "paid", caseId: "case-1" })).toEqual({
      proceed: true,
      caseId: "case-1",
    });
  });

  it("prefers the poll's case id over a looked-up one", () => {
    // The poll reads it off the same payment_records row as the status, so
    // it is the authoritative answer.
    expect(stepAfterPayment({ status: "paid", caseId: "from-poll" }, "from-lookup")).toEqual({
      proceed: true,
      caseId: "from-poll",
    });
  });

  it("falls back to a looked-up case id", () => {
    // For a payment marked paid before the webhook learned to link the
    // case. Normally unused.
    expect(stepAfterPayment({ status: "paid", caseId: null }, "from-lookup")).toEqual({
      proceed: true,
      caseId: "from-lookup",
    });
  });

  it("REFUSES to proceed when paid but no case can be found", () => {
    // The whole reason this function exists. The scanning stage starts the
    // analysis from an effect gated on a case id, so entering it without
    // one leaves the customer watching "scanning" forever while nothing
    // runs — and the stage is client-only state that resets on reload, so
    // there is no way back. Two real paid cases were stranded that way on
    // 2026-11-10/11.
    const step = stepAfterPayment({ status: "paid", caseId: null }, null);
    expect(step.proceed).toBe(false);
    expect(step).toEqual({ proceed: false, message: PAYMENT_TAKEN_BUT_NO_CASE });
  });

  it("tells the customer their money is safe when that happens", () => {
    // They have paid. The one conclusion they must not reach is that they
    // should pay again.
    expect(PAYMENT_TAKEN_BUT_NO_CASE).toContain("payment went through");
    expect(PAYMENT_TAKEN_BUT_NO_CASE).toContain("won't be charged twice");
  });

  it("reports a failed payment", () => {
    expect(stepAfterPayment({ status: "failed", caseId: null })).toEqual({
      proceed: false,
      message: PAYMENT_FAILED,
    });
  });

  it("stays put while the webhook has not landed", () => {
    expect(stepAfterPayment({ status: "pending", caseId: null })).toEqual({
      proceed: false,
      message: PAYMENT_STILL_CONFIRMING,
    });
  });

  it("never proceeds on a failed payment that somehow carries a case id", () => {
    // Order matters: the status is checked before the case id, so a stale
    // or mismatched id cannot carry a failed payment into scanning.
    expect(stepAfterPayment({ status: "failed", caseId: "case-1" }).proceed).toBe(false);
    expect(stepAfterPayment({ status: "pending", caseId: "case-1" }).proceed).toBe(false);
  });

  it("does not treat an empty string as a case id", () => {
    expect(stepAfterPayment({ status: "paid", caseId: "" }, "").proceed).toBe(false);
  });
});
