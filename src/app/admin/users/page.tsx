import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearchTerm, ADMIN_PAGE_SIZE } from "@/lib/searchFilter";
import AdminTableToolbar from "@/components/admin/AdminTableToolbar";
import Pagination from "@/components/admin/Pagination";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, name, email, status, created_at, avatar_url", { count: "exact" })
    .eq("role", "customer");

  const search = q ? sanitizeSearchTerm(q) : "";
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data: customers, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Customers</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">User List</h2>

        <AdminTableToolbar searchPlaceholder="Search by name or email" statusOptions={STATUS_OPTIONS} />

        {!customers || customers.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {search || (status && status !== "all") ? "No customers match your search." : "No customers yet."}
          </p>
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
                    <td className="py-3 pr-4 text-gray-500">{String(from + i + 1).padStart(3, "0")}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/users/${c.id}`}
                        className="flex items-center gap-2 text-gray-800 hover:text-primary-700"
                      >
                        {c.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-primary-100" />
                        )}
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

        <Pagination page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}
