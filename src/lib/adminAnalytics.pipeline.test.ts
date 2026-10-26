import { describe, expect, it } from "vitest";
import {
  isStalled,
  pipelineStatusSegments,
  bucketCountByMonth,
  successRate,
  STALLED_AFTER_MINUTES,
} from "./adminAnalytics";

const NOW = new Date("2026-10-26T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

describe("isStalled", () => {
  it("counts a long-running scan as stalled", () => {
    expect(isStalled("scanning", minutesAgo(STALLED_AFTER_MINUTES + 1), NOW)).toBe(true);
  });

  it("leaves a scan that only just started alone", () => {
    expect(isStalled("scanning", minutesAgo(1), NOW)).toBe(false);
  });

  it("does not treat a case that never started scanning as stalled", () => {
    // An uploaded case is waiting for payment, not stuck in the pipeline.
    expect(isStalled("uploaded", minutesAgo(60 * 24), NOW)).toBe(false);
    expect(isStalled("paid", minutesAgo(60 * 24), NOW)).toBe(false);
  });
});

describe("pipelineStatusSegments", () => {
  it("says so plainly when nothing has happened", () => {
    const [only] = pipelineStatusSegments({ success: 0, pending: 0, failed: 0, reviews: 0 });
    expect(only.label).toBe("No activity yet");
  });

  it("reports real proportions", () => {
    const s = pipelineStatusSegments({ success: 80, pending: 10, failed: 3, reviews: 7 });
    expect(s.map((x) => [x.label, x.value])).toEqual([
      ["Pending", 10],
      ["Failed", 3],
      ["Success", 80],
      ["Reviews", 7],
    ]);
  });

  it("does not round a single stalled case away to nothing", () => {
    const s = pipelineStatusSegments({ success: 0, pending: 0, failed: 1, reviews: 0 });
    expect(s.find((x) => x.label === "Failed")?.value).toBe(100);
  });
});

describe("bucketCountByMonth", () => {
  it("counts cases per month rather than summing an amount", () => {
    const rows = [
      { created_at: "2026-10-02T00:00:00Z" },
      { created_at: "2026-10-20T00:00:00Z" },
      { created_at: "2026-09-15T00:00:00Z" },
    ];
    const months = bucketCountByMonth(rows, 3, NOW);
    expect(months.map((m) => m.total)).toEqual([0, 1, 2]);
    expect(months.at(-1)?.label).toBe("Oct");
  });

  it("ignores anything outside the window", () => {
    const months = bucketCountByMonth([{ created_at: "2020-01-01T00:00:00Z" }], 3, NOW);
    expect(months.every((m) => m.total === 0)).toBe(true);
  });
});

describe("successRate", () => {
  it("returns null when nothing has finished, rather than a confident zero", () => {
    expect(successRate(0, 0)).toBeNull();
  });

  it("measures finished work only — cases still running do not count against it", () => {
    expect(successRate(9, 1)).toBe(90);
    expect(successRate(0, 4)).toBe(0);
  });
});
