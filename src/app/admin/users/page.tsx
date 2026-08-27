import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("profiles")
    .select("id, name, email, status, created_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false });

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

        {!customers || customers.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No customers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Full name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Date joined</th>
                  <th className="py-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className="border-t border-gray-50">
                    <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/users/${c.id}`}
                        className="flex items-center gap-2 text-gray-800 hover:text-primary-700"
                      >
                        <span className="h-7 w-7 shrink-0 rounded-full bg-primary-100" />
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{c.email}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td
                      className={`py-3 pr-4 font-medium ${
                        c.status === "active" ? "text-primary-600" : "text-danger"
                      }`}
                    >
                      {c.status === "active" ? "Active" : "Suspended"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
