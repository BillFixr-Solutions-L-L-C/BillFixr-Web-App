const admins = [
  { name: "Cynthia Enenche", email: "Cynthia@wearwise.com", role: "Administrator", permissions: "Full" },
  { name: "Cynthia Enenche", email: "Cynthia@wearwise.com", role: "Content moderator", permissions: "04" },
  { name: "Cynthia Enenche", email: "Cynthia@wearwise.com", role: "Finance admin", permissions: "04" },
  { name: "Cynthia Enenche", email: "Cynthia@wearwise.com", role: "Customer support", permissions: "03" },
];

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Settings</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Manage Admins</h2>
          <button
            type="button"
            className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Add new admin +
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">SN</th>
                <th className="py-3 pr-4">Full name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Permissions</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="flex items-center gap-2 py-3 pr-4 text-gray-800">
                    <span className="h-7 w-7 rounded-full bg-primary-100" />
                    {a.name}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{a.email}</td>
                  <td className="py-3 pr-4 text-gray-800">{a.role}</td>
                  <td className="py-3 pr-4 text-gray-500">{a.permissions}</td>
                  <td className="py-3 text-gray-400">
                    <span className="mr-3">✎</span>
                    <span>🗑</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
