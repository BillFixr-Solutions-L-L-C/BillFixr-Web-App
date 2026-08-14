const accounts = [
  { name: "Admin", email: "Admin@gmail.com", role: "Admin", lastLogin: "Aug. 12 2026", status: "Active" },
  { name: "Analyst", email: "Analyst@gmail.com", role: "Analyst", lastLogin: "Aug. 12 2026", status: "Suspended" },
  { name: "Kloe", email: "Kloe@gmail.com", role: "Manager", lastLogin: "Aug. 12 2026", status: "Invited" },
  { name: "Admin", email: "Admin@gmail.com", role: "Admin", lastLogin: "Aug. 12 2026", status: "Active" },
];

const statusTone: Record<string, string> = {
  Active: "text-primary-600",
  Suspended: "text-purple-500",
  Invited: "text-accent-600",
};

const logs = [
  { timestamp: "12:09:098", user: "Login" },
  { timestamp: "12:09:098", user: "API Key Generated" },
  { timestamp: "12:09:098", user: "Role Changed" },
];

const roles = [
  { role: "Admin", edit: true, permissions: true },
  { role: "Analyst", edit: true, permissions: true },
  { role: "Manager", edit: true, permissions: true },
  { role: "Letter 2B", edit: true, permissions: true },
];

export default function UserManagementPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">User Management Dashboard</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">User Account &amp; Access Control</h2>
            </div>
            <div className="mb-4 flex gap-2">
              <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
                <option>Filter</option>
              </select>
              <input
                placeholder="Search"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500"
              />
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Last Login</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="flex items-center gap-2 py-2.5 pr-4 text-gray-800">
                      <span className="h-6 w-6 rounded-full bg-primary-100" />
                      {a.name}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{a.email}</td>
                    <td className="py-2.5 pr-4 text-gray-800">{a.role}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{a.lastLogin}</td>
                    <td className={`py-2.5 pr-4 font-medium ${statusTone[a.status]}`}>{a.status}</td>
                    <td className="py-2.5">
                      {a.status === "Active" && (
                        <button type="button" className="rounded-lg border border-gray-200 px-3 py-1 text-xs">
                          Edit
                        </button>
                      )}
                      {a.status === "Suspended" && (
                        <button type="button" className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-600">
                          Send Invite
                        </button>
                      )}
                      {a.status === "Invited" && (
                        <button type="button" className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-500">
                          Revoke Access
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Subscription &amp; Billing Details</h2>
              <button type="button" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium">
                Manage Subscription
              </button>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="font-semibold text-gray-900">Individual</p>
                <p className="mt-1 text-sm text-gray-500">Individual Subscription Tier</p>
                <p className="text-sm text-gray-500">Tier: Individual</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Payment Method</p>
                <p className="mt-1 text-sm text-gray-500">Payment: **** Okafor</p>
                <p className="text-sm text-gray-500">Payment: **** 082963z</p>
                <p className="text-sm text-gray-500">Renewal: USA</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Renewal Date</p>
                <p className="mt-1 text-sm text-gray-500">Aug 20, 2026</p>
                <p className="mt-3 text-sm font-semibold text-gray-900">Usage Quota</p>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                  <div className="h-2 w-[30%] rounded-full bg-primary-500" />
                </div>
                <p className="mt-1 text-xs text-gray-400">30% Quota</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">User Activity &amp; Login Logs</h2>
            <div className="mb-3 flex gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500">
                <option>Filter</option>
              </select>
              <input
                placeholder="Search"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500"
              />
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">Timestamp</th>
                  <th className="py-1.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 pr-2 text-gray-500">{l.timestamp}</td>
                    <td className="py-1.5 text-gray-700">{l.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">System Roles &amp; Permissions</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="py-1.5 font-medium">Roles</th>
                  <th className="py-1.5 font-medium">Edit</th>
                  <th className="py-1.5 font-medium">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.role} className="border-t border-gray-50">
                    <td className="py-1.5 text-gray-800">{r.role}</td>
                    <td className="py-1.5">
                      <input type="checkbox" defaultChecked readOnly />
                    </td>
                    <td className="py-1.5">
                      <input type="checkbox" defaultChecked readOnly />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">User Account Summary</h2>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-primary-500" /> Active 0
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Suspended 0
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-accent-500" /> Invited 0
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
