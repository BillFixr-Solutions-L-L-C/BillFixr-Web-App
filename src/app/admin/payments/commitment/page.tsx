import PaymentsTable from "@/components/admin/PaymentsTable";
import { createClient } from "@/lib/supabase/server";
import { getPaymentRows } from "@/lib/paymentTransactions";
import { ADMIN_PAGE_SIZE } from "@/lib/searchFilter";
import AdminTableToolbar from "@/components/admin/AdminTableToolbar";
import Pagination from "@/components/admin/Pagination";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Successful" },
  { value: "pending", label: "Processing" },
  { value: "failed", label: "Failed" },
];

export default async function CommitmentFeePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();
  const [{ rows, totalCount }, { data: canIssueRefunds }] = await Promise.all([
    getPaymentRows(supabase, "commitment_fee", {
      limit: ADMIN_PAGE_SIZE,
      page,
      search: q,
      status: status && status !== "all" ? (status as "paid" | "pending" | "failed") : undefined,
    }),
    supabase.rpc("can_issue_refunds"),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Transactions</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Commitment Fee</h2>
        <AdminTableToolbar searchPlaceholder="Search by customer name or email" statusOptions={STATUS_OPTIONS} />
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {q || (status && status !== "all") ? "No payments match your search." : "No commitment fee payments yet."}
          </p>
        ) : (
          <>
            <PaymentsTable rows={rows} canIssueRefunds={Boolean(canIssueRefunds)} />
            <p className="mt-6 text-sm text-gray-500">
              Showing {rows.length} of {totalCount} entries
            </p>
          </>
        )}
        <Pagination page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}
