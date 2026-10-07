import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearchTerm, ADMIN_PAGE_SIZE } from "@/lib/searchFilter";
import { COMPLETED_STATUSES } from "@/lib/caseStatus";
import AdminTableToolbar from "@/components/admin/AdminTableToolbar";
import Pagination from "@/components/admin/Pagination";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";

type CompletedCaseRow = {
  id: string;
  created_at: string;
  profiles: { name: string | null; email: string | null } | null;
};

export default async function AdminCompletedCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  if (!hasDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return <AccessRestricted />;
  }

  const search = q ? sanitizeSearchTerm(q) : "";

  // Every row here is completed by definition, so there's no status filter —
  // the Status column exists only because the design draws it.
  let query = supabase
    .from("cases")
    .select(
      search
        ? "id, created_at, profiles!cases_user_id_fkey!inner(name, email)"
        : "id, created_at, profiles!cases_user_id_fkey(name, email)",
      { count: "exact" },
    )
    .in("status", [...COMPLETED_STATUSES]);

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`, {
      referencedTable: "profiles",
    });
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);

  const rows = (data ?? []) as unknown as CompletedCaseRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Completed Case</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Customer List</h2>

        <AdminTableToolbar searchPlaceholder="Search by name or email" />

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {search ? "No completed cases match your search." : "No completed cases yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Unique ID</th>
                  <th className="py-3 pr-4">Full name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Date completed</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} className="border-t border-gray-50">
                    <td className="py-3 pr-4 text-gray-500">{String(from + i + 1).padStart(3, "0")}</td>
                    <td className="py-3 pr-4 text-gray-800">
                      <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                        #{row.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-gray-800">{row.profiles?.name ?? "Unknown"}</td>
                    <td className="py-3 pr-4 text-gray-500">{row.profiles?.email ?? "—"}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(row.created_at).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 pr-4 font-medium text-primary-600">Completed</td>
                    <td className="py-3 text-gray-500">
                      <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                        View
                      </Link>
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
