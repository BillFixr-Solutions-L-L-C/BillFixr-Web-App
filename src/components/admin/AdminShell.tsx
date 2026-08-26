import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";

export default function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; roleName: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminTopbar user={user} />
        <main className="overflow-x-auto p-4 sm:p-6">
          <div className="min-h-[calc(100vh-6rem)] rounded-3xl bg-gradient-to-b from-cream-50 via-cream-50 to-primary-50 p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
