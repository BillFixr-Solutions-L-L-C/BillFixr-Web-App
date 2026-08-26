import Sidebar from "@/components/dashboard/Sidebar";

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; status: "active" | "suspended" };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="min-h-[calc(100vh-2rem)] rounded-3xl bg-gradient-to-b from-cream-50 via-cream-50 to-primary-50 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
