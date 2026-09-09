import PaymentsTable from "@/components/admin/PaymentsTable";
import { createClient } from "@/lib/supabase/server";
import { getPaymentRows } from "@/lib/paymentTransactions";

export default async function CommitmentFeePage() {
  const supabase = await createClient();
  const rows = await getPaymentRows(supabase, "commitment_fee", 100);
  const { data: canIssueRefunds } = await supabase.rpc("can_issue_refunds");

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Transactions</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Commitment Fee</h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No commitment fee payments yet.</p>
        ) : (
          <>
            <PaymentsTable rows={rows} canIssueRefunds={Boolean(canIssueRefunds)} />
            <p className="mt-6 text-sm text-gray-500">Showing the {rows.length} most recent entries</p>
          </>
        )}
      </div>
    </div>
  );
}
