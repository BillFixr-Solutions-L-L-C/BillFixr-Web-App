// What the upload flow does once the commitment payment has been polled.
//
// Extracted from src/app/dashboard/page.tsx because getting it wrong is
// expensive and invisible. The scanning stage kicks off the bill analysis
// from an effect gated on having a case id; entering that stage without one
// leaves the customer on a screen that says "scanning" forever while
// nothing runs. And because the whole stage machine is client-only state
// that resets to `upload` on reload, there was no way back — the case sat
// in Active Case, paid for, with no analysis and no negotiation.
//
// That happened to two real paid cases on 2026-11-10/11. The webhook
// ordering fix (create and link the case before marking the payment paid)
// stops the race; this is the belt to that braces, and the only part of it
// that can be tested without rendering the whole dashboard.

export type PollResult = {
  status: "paid" | "failed" | "pending";
  caseId: string | null;
};

export type PostPaymentStep =
  /** Go to the scanning stage with this case. */
  | { proceed: true; caseId: string }
  /** Stay on the payment screen and show this. */
  | { proceed: false; message: string };

export const PAYMENT_FAILED =
  "Payment failed. Please try again.";

export const PAYMENT_STILL_CONFIRMING =
  "Still confirming your payment — please wait a moment and try again.";

// Deliberately says the money is safe. By this point the fee is paid, and
// the one thing a customer must not conclude is that they should pay again.
export const PAYMENT_TAKEN_BUT_NO_CASE =
  "Your payment went through, but we couldn't open your case just yet. Press Continue to try again — you won't be charged twice.";

/**
 * @param result        what pollPaymentStatus returned. Its `caseId` comes
 *                      off the same `payment_records` row as its `status`,
 *                      so it is the authoritative one.
 * @param fallbackCaseId a case found by querying `cases` directly. Only for
 *                      a payment marked paid before the webhook learned to
 *                      link the case; normally null and unused.
 */
export function stepAfterPayment(
  result: PollResult,
  fallbackCaseId: string | null = null,
): PostPaymentStep {
  if (result.status === "failed") {
    return { proceed: false, message: PAYMENT_FAILED };
  }
  if (result.status === "pending") {
    // The webhook has not landed inside the poll window. Retrying reuses
    // the same intent, so this is safe to repeat.
    return { proceed: false, message: PAYMENT_STILL_CONFIRMING };
  }

  const caseId = result.caseId ?? fallbackCaseId;
  if (!caseId) {
    return { proceed: false, message: PAYMENT_TAKEN_BUT_NO_CASE };
  }
  return { proceed: true, caseId };
}
