import PaymentsTable from "@/components/admin/PaymentsTable";
import { commitmentFees } from "@/components/admin/paymentsData";

export default function CommitmentFeePage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Transactions</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Commitment Fee</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>Day</option>
          </select>
        </div>
        <PaymentsTable rows={[...commitmentFees, ...commitmentFees]} />

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
