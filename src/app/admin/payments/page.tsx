import Link from "next/link";
import PaymentsTable from "@/components/admin/PaymentsTable";
import { commitmentFees, percentageFees } from "@/components/admin/paymentsData";

export default function AdminPaymentsPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Transactions</h1>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Commitment Fee</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>1 Month</option>
          </select>
        </div>
        <PaymentsTable rows={commitmentFees} />
        <Link
          href="/admin/payments/commitment"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-700"
        >
          See all →
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Percentage Fee</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>1 Month</option>
          </select>
        </div>
        <PaymentsTable rows={percentageFees} />
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
