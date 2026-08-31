import AdminSearch from "@/components/admin/AdminSearch";
import NotificationBell from "@/components/admin/NotificationBell";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "long",
  day: "2-digit",
  year: "2-digit",
});

type Notification = { id: string; type: string; message: string; read: boolean; created_at: string };

export default function AdminTopbar({
  user,
  initialNotifications,
}: {
  user: { name: string; roleName: string };
  initialNotifications: Notification[];
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 sm:px-8 sm:py-5">
      <p className="text-sm font-semibold text-gray-900 sm:text-lg">{today}</p>

      <AdminSearch />

      <div className="flex items-center gap-3 sm:gap-5">
        <NotificationBell initialNotifications={initialNotifications} />

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-primary-600">{user.roleName}</p>
          </div>
          <span className="h-9 w-9 shrink-0 rounded-full bg-primary-100" />
        </div>
      </div>
    </header>
  );
}
