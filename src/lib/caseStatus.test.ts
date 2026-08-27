import { describe, expect, it } from "vitest";
import { isCaseCompleted, isPendingReview } from "./caseStatus";

describe("isCaseCompleted", () => {
  it.each(["resolved", "paid", "closed", "closed_no_errors"])("treats %s as completed", (status) => {
    expect(isCaseCompleted(status)).toBe(true);
  });

  it.each(["uploaded", "scanning", "analyzed", "letter_sent", "awaiting_response", "response_received", "payment_pending"])(
    "does not treat %s as completed",
    (status) => {
      expect(isCaseCompleted(status)).toBe(false);
    },
  );
});

describe("isPendingReview", () => {
  it.each(["uploaded", "scanning", "analyzed"])("treats %s as pending review", (status) => {
    expect(isPendingReview(status)).toBe(true);
  });

  it.each(["resolved", "paid", "closed", "awaiting_response"])("does not treat %s as pending review", (status) => {
    expect(isPendingReview(status)).toBe(false);
  });

  it("never overlaps with completed statuses", () => {
    const completed = ["resolved", "paid", "closed", "closed_no_errors"];
    const pending = ["uploaded", "scanning", "analyzed"];
    for (const status of completed) {
      expect(isPendingReview(status)).toBe(false);
    }
    for (const status of pending) {
      expect(isCaseCompleted(status)).toBe(false);
    }
  });
});
