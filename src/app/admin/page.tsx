import CaseTable from "@/components/admin/CaseTable";
import RevenueChart from "@/components/admin/RevenueChart";
import DonutChart from "@/components/admin/DonutChart";
import OpsPanel from "@/components/admin/OpsPanel";
import { WalletIcon, UploadsIcon, SupportIcon } from "@/components/admin/icons";

const stats = [
  { label: "Total Cases", value: "1,240", tone: "text-gray-900" },
  { label: "Open Cases", value: "241", tone: "text-gray-900" },
  { label: "Completed", value: "720", tone: "text-primary-600" },
  { label: "Pending Review", value: "720", tone: "text-accent-600" },
];

const iconStats = [
  { label: "Total Revenue", value: "$1,257,274", trend: "+23%", bg: "bg-primary-500", icon: WalletIcon },
  { label: "Upload count", value: "1,274", trend: null, bg: "bg-blue-500", icon: UploadsIcon },
  { label: "Support tickets", value: "14", trend: null, bg: "bg-accent-500", icon: SupportIcon },
];

export default function AdminDashboardPage() {
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
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">System Health & Reporting</h2>
              <RevenueChart />
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Today&apos;s Status Distribution</h2>
              <DonutChart />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <CaseTable />
          </div>
        </div>

        <OpsPanel />
      </div>
    </div>
  );
}
