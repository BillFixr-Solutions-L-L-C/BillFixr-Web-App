import CaseTable from "@/components/admin/CaseTable";
import RevenueChart from "@/components/admin/RevenueChart";
import DonutChart from "@/components/admin/DonutChart";
import OpsPanel from "@/components/admin/OpsPanel";
import { WalletIcon, UploadsIcon, SupportIcon } from "@/components/admin/icons";
import { createClient } from "@/lib/supabase/server";

const COMPLETED_STATUSES = ["resolved", "paid", "closed", "closed_no_errors"];
const PENDING_REVIEW_STATUSES = ["uploaded", "scanning", "analyzed"];

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalCases },
    { count: completedCases },
    { count: pendingReviewCases },
    { count: uploadCount },
    { count: supportTicketCount },
    { data: paidPayments },
  ] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }),
    supabase.from("cases").select("id", { count: "exact", head: true }).in("status", COMPLETED_STATUSES),
    supabase.from("cases").select("id", { count: "exact", head: true }).in("status", PENDING_REVIEW_STATUSES),
    supabase.from("bills").select("id", { count: "exact", head: true }),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }),
    supabase.from("payment_records").select("amount").eq("status", "paid"),
  ]);

  const totalRevenue = (paidPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const openCases = (totalCases ?? 0) - (completedCases ?? 0);

  const stats = [
    { label: "Total Cases", value: (totalCases ?? 0).toLocaleString(), tone: "text-gray-900" },
    { label: "Open Cases", value: openCases.toLocaleString(), tone: "text-gray-900" },
    { label: "Completed", value: (completedCases ?? 0).toLocaleString(), tone: "text-primary-600" },
    { label: "Pending Review", value: (pendingReviewCases ?? 0).toLocaleString(), tone: "text-accent-600" },
  ];

  const iconStats = [
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      trend: null,
      bg: "bg-primary-500",
      icon: WalletIcon,
    },
    { label: "Upload count", value: (uploadCount ?? 0).toLocaleString(), trend: null, bg: "bg-blue-500", icon: UploadsIcon },
    {
      label: "Support tickets",
      value: (supportTicketCount ?? 0).toLocaleString(),
      trend: null,
      bg: "bg-accent-500",
      icon: SupportIcon,
    },
  ];

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-400">{s.label}</p>
            <p className={`mt-2 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {iconStats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
              <span className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${s.bg}`}>
                <Icon />
              </span>
              <div>
                <p className="flex items-center gap-2 text-sm text-gray-400">
                  {s.label}
                  {s.trend && <span className="text-primary-600">{s.trend}</span>}
                </p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">System Health & Reporting</h2>
              <RevenueChart />
            </div>
            <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Today&apos;s Status Distribution</h2>
              <DonutChart />
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
            <CaseTable />
          </div>
        </div>

        <OpsPanel />
      </div>
    </div>
  );
}
