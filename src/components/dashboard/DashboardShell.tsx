import Sidebar from "@/components/dashboard/Sidebar";
import IdleTimeout, { CUSTOMER_IDLE_MS } from "@/components/IdleTimeout";

export type ShellNotification = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
};

export default function DashboardShell({
  children,
  user,
  initialNotifications = [],
}: {
  children: React.ReactNode;
  user: { name: string; status: "active" | "suspended"; avatarUrl: string | null };
  initialNotifications?: ShellNotification[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      {/* Customers get the same idle sign-out admins have had, on a
          longer window. Mounted on the shell so it covers every
          dashboard page rather than any single screen. */}
      <IdleTimeout timeoutMs={CUSTOMER_IDLE_MS} />
      <Sidebar user={user} initialNotifications={initialNotifications} />
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="min-h-[calc(100vh-2rem)] rounded-3xl bg-gradient-to-b from-cream-50 via-cream-50 to-primary-50 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
