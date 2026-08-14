import Link from "next/link";

const customers = Array.from({ length: 10 }).map(() => ({
  id: "#000189",
  name: "Emeka James",
  email: "emmyJames@gmail.com",
  date: "20 Jan, 12:30 PM",
  status: "Active",
}));

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Customers</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">User List</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>1 Month</option>
            <option>3 Months</option>
            <option>1 Year</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">SN</th>
                <th className="py-3 pr-4">Unique ID</th>
                <th className="py-3 pr-4">Full name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Date joined</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="py-3 pr-4">
                    <Link href="/admin/users/1" className="flex items-center gap-2 text-gray-800 hover:text-primary-700">
                      <span className="h-7 w-7 rounded-full bg-primary-100" />
                      {c.id}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-gray-800">{c.name}</td>
                  <td className="py-3 pr-4 text-gray-500">{c.email}</td>
                  <td className="py-3 pr-4 text-gray-500">{c.date}</td>
                  <td className="py-3 pr-4 font-medium text-primary-600">{c.status}</td>
                  <td className="py-3 text-right text-gray-400">
                    <span className="mr-3">🚫</span>
                    <span>🗑</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <p>Showing 1-20 of 75 entries</p>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-gray-200 px-4 py-1.5">
              ← Previous
            </button>
            <button type="button" className="rounded-lg border border-gray-200 px-4 py-1.5">
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
