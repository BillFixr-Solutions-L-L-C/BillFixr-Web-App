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
