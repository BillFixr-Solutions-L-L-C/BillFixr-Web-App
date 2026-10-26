import type { RevenueMonth } from "@/components/admin/RevenueChart";
import type { DonutSegment } from "@/components/admin/DonutChart";

export function bucketRevenueByMonth(
  payments: { amount: number | string; created_at: string }[],
  monthCount: number,
  now: Date = new Date(),
): RevenueMonth[] {
  const buckets: { year: number; monthIndex: number; label: string; total: number }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
      label: d.toLocaleDateString("en-US", { month: "short" }),
      total: 0,
    });
  }

  for (const payment of payments) {
    const d = new Date(payment.created_at);
    const bucket = buckets.find((b) => b.year === d.getFullYear() && b.monthIndex === d.getMonth());
    if (bucket) bucket.total += Number(payment.amount);
  }

  return buckets.map(({ label, total }) => ({ label, total }));
}

export function caseStatusSegments(counts: { total: number; completed: number; pendingReview: number }): DonutSegment[] {
  const { total, completed, pendingReview } = counts;
  if (total === 0) {
    return [{ label: "No cases yet", value: 100, color: "#d9d9d9" }];
  }

  const inProgress = Math.max(0, total - completed - pendingReview);
  const pct = (n: number) => Math.round((n / total) * 100);

  return [
    { label: "Completed", value: pct(completed), color: "#2DD9B0" },
    { label: "In Progress", value: pct(inProgress), color: "#5B7CFA" },
    { label: "Pending Review", value: pct(pendingReview), color: "#F5A93F" },
  ];
}

// A case that entered the pipeline and never came out. With no AI service
// connected, everything that started scanning is stalled by definition —
// which is exactly what the monitoring screen should be showing.
export const STALLED_AFTER_MINUTES = 30;

export function isStalled(status: string, startedAt: string, now: Date = new Date()): boolean {
  if (status !== "scanning") return false;
  return now.getTime() - new Date(startedAt).getTime() > STALLED_AFTER_MINUTES * 60_000;
}

// Same four labels the design draws, mapped onto states we can actually
// observe without the AI service: nothing here is invented.
export function pipelineStatusSegments(counts: {
  success: number;
  pending: number;
  failed: number;
  reviews: number;
}): DonutSegment[] {
  const total = counts.success + counts.pending + counts.failed + counts.reviews;
  if (total === 0) {
    return [{ label: "No activity yet", value: 100, color: "#d9d9d9" }];
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return [
    { label: "Pending", value: pct(counts.pending), color: "#5B7CFA" },
    { label: "Failed", value: pct(counts.failed), color: "#F45B94" },
    { label: "Success", value: pct(counts.success), color: "#2DD9B0" },
    { label: "Reviews", value: pct(counts.reviews), color: "#F5A93F" },
  ];
}

// Throughput rather than revenue: how many cases entered the pipeline each
// month. Same shape as the revenue series so it reuses RevenueChart.
export function bucketCountByMonth(
  rows: { created_at: string }[],
  monthCount: number,
  now: Date = new Date(),
): RevenueMonth[] {
  const buckets = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), monthIndex: d.getMonth(), label: d.toLocaleDateString("en-US", { month: "short" }), total: 0 });
  }
  for (const row of rows) {
    const d = new Date(row.created_at);
    const bucket = buckets.find((b) => b.year === d.getFullYear() && b.monthIndex === d.getMonth());
    if (bucket) bucket.total += 1;
  }
  return buckets.map(({ label, total }) => ({ label, total }));
}

// What share of everything that finished, finished successfully. Returns
// null when nothing has finished, so the screen can say so rather than
// printing a confident 0% or 100% off one case.
export function successRate(success: number, failed: number): number | null {
  const finished = success + failed;
  if (finished === 0) return null;
  return Math.round((success / finished) * 100);
}
