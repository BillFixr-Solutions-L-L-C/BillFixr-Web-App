import Sidebar from "@/components/dashboard/Sidebar";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="min-h-[calc(100vh-2rem)] rounded-3xl bg-gradient-to-b from-cream-50 via-cream-50 to-primary-50 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
