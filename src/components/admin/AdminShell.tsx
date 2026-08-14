import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar />
      <div className="flex-1">
        <AdminTopbar />
        <main className="p-6">
          <div className="min-h-[calc(100vh-6rem)] rounded-3xl bg-gradient-to-b from-cream-50 via-cream-50 to-primary-50 p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
