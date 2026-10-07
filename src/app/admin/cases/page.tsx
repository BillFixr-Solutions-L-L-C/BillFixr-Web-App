import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearchTerm, ADMIN_PAGE_SIZE } from "@/lib/searchFilter";
import { COMPLETED_STATUSES, isCaseCompleted } from "@/lib/caseStatus";
import AdminTableToolbar from "@/components/admin/AdminTableToolbar";
import Pagination from "@/components/admin/Pagination";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";

// Figma draws exactly two status values on this table — "In Progress" and
// "Completed" — so the filter offers those rather than the full set of
// underlying case statuses.
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

type CaseRow = {
  id: string;
  status: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  if (!hasDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return <AccessRestricted />;
  }

  const search = q ? sanitizeSearchTerm(q) : "";

  // !inner so the client name is filterable — an outer embed can't be used
  // in a where clause. Cases always have an owner, so this drops nothing.
  let query = supabase
    .from("cases")
    .select(
      search
        ? "id, status, created_at, profiles!cases_user_id_fkey!inner(name)"
        : "id, status, created_at, profiles!cases_user_id_fkey(name)",
      { count: "exact" },
    );

  if (search) {
    query = query.ilike("profiles.name", `%${search}%`);
  }
  if (status === "completed") {
    query = query.in("status", [...COMPLETED_STATUSES]);
  } else if (status === "in_progress") {
    query = query.not("status", "in", `(${COMPLETED_STATUSES.join(",")})`);
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);

  const rows = (data ?? []) as unknown as CaseRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE));
  const filtering = Boolean(search || (status && status !== "all"));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Case Detail</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Case List</h2>

        <AdminTableToolbar searchPlaceholder="Search by client name" statusOptions={STATUS_OPTIONS} />

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {filtering ? "No cases match your search." : "No cases yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Case ID</th>
                  <th className="py-3 pr-4">Client Name</th>
                  <th className="py-3 pr-4">Date of Order</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const delivered = isCaseCompleted(row.status);
                  return (
                    <tr key={row.id} className="border-t border-gray-50">
                      <td className="py-3 pr-4 text-gray-500">{String(from + i + 1).padStart(3, "0")}</td>
                      <td className="py-3 pr-4 text-gray-800">
                        <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                          #{row.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-gray-800">{row.profiles?.name ?? "Unknown"}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {new Date(row.created_at).toLocaleDateString("en-US", {
                          day: "2-digit",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className={`py-3 pr-4 font-medium ${delivered ? "text-primary-600" : "text-accent-600"}`}>
                        {delivered ? "Completed" : "In Progress"}
                      </td>
                      <td className="py-3 text-gray-500">
                        <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}
