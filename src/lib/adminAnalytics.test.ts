import { describe, expect, it } from "vitest";
import { bucketRevenueByMonth, caseStatusSegments } from "./adminAnalytics";

describe("bucketRevenueByMonth", () => {
  const now = new Date(2026, 8, 15); // Sep 15, 2026

  it("returns one zero-total bucket per month when there are no payments", () => {
    const months = bucketRevenueByMonth([], 3, now);
    expect(months).toEqual([
      { label: "Jul", total: 0 },
      { label: "Aug", total: 0 },
      { label: "Sep", total: 0 },
    ]);
  });

  it("sums payments into the correct month bucket", () => {
    const months = bucketRevenueByMonth(
      [
        { amount: "5.00", created_at: "2026-08-03T00:00:00Z" },
        { amount: 10, created_at: "2026-08-20T00:00:00Z" },
        { amount: 3, created_at: "2026-09-01T00:00:00Z" },
      ],
      3,
      now,
    );
    expect(months).toEqual([
      { label: "Jul", total: 0 },
      { label: "Aug", total: 15 },
      { label: "Sep", total: 3 },
    ]);
  });

  it("ignores payments outside the requested window", () => {
    const months = bucketRevenueByMonth([{ amount: 100, created_at: "2025-01-01T00:00:00Z" }], 3, now);
    expect(months.reduce((sum, m) => sum + m.total, 0)).toBe(0);
  });
});

describe("caseStatusSegments", () => {
  it("returns an honest empty-state segment when there are zero cases", () => {
    const segments = caseStatusSegments({ total: 0, completed: 0, pendingReview: 0 });
    expect(segments).toEqual([{ label: "No cases yet", value: 100, color: "#d9d9d9" }]);
  });

  it("computes real percentages across completed/in-progress/pending-review", () => {
    const segments = caseStatusSegments({ total: 10, completed: 4, pendingReview: 2 });
    expect(segments).toEqual([
      { label: "Completed", value: 40, color: "#2DD9B0" },
      { label: "In Progress", value: 40, color: "#5B7CFA" },
      { label: "Pending Review", value: 20, color: "#F5A93F" },
    ]);
  });
});
