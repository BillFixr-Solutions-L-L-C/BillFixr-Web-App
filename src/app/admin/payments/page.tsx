import Link from "next/link";
import PaymentsTable from "@/components/admin/PaymentsTable";
import BillingSettingsCard from "@/components/admin/BillingSettingsCard";
import { createClient } from "@/lib/supabase/server";
import { getPaymentRows } from "@/lib/paymentTransactions";

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const [commitmentFees, percentageFees, { data: settings }, { data: canIssueRefunds }] = await Promise.all([
    getPaymentRows(supabase, "commitment_fee", 5),
    getPaymentRows(supabase, "success_fee", 5),
    supabase.from("app_settings").select("success_fee_percentage").eq("id", 1).single(),
    supabase.rpc("can_issue_refunds"),
  ]);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Transactions</h1>

      <BillingSettingsCard initialPercentage={Number(settings?.success_fee_percentage ?? 30)} />

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Commitment Fee</h2>
        {commitmentFees.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No commitment fee payments yet.</p>
        ) : (
          <PaymentsTable rows={commitmentFees} canIssueRefunds={Boolean(canIssueRefunds)} />
        )}
        <Link
          href="/admin/payments/commitment"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-700"
        >
          See all →
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Percentage Fee</h2>
        {percentageFees.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No percentage fee payments yet.</p>
        ) : (
          <PaymentsTable rows={percentageFees} canIssueRefunds={Boolean(canIssueRefunds)} />
        )}
        <Link
          href="/admin/payments/percentage"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-700"
        >
          See all →
        </Link>
      </div>
    </div>
  );
}
