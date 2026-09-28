import Link from "next/link";

export type CompletedCaseRow = {
  id: string;
  filename: string;
  provider: string;
  uploadedAt: string | null;
  appealLetterSent: boolean;
  savings: number | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSavings(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function CompletedCasesTable({ rows }: { rows: CompletedCaseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="py-6 text-center text-sm text-gray-400">
          No completed cases yet. Cases appear here once they&apos;re resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
              <th className="px-4 py-3">Bill</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Upload Date</th>
              <th className="px-4 py-3">Appeal Letter</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Proposed Savings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/completed/${row.id}`} className="flex items-center gap-2 text-gray-800">
                    <span className="text-accent-500">📄</span>
                    <span className="max-w-[180px] truncate">{row.filename}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{row.provider}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(row.uploadedAt)}</td>
                <td className="px-4 py-3 text-primary-600">{row.appealLetterSent ? "Sent" : "—"}</td>
                <td className="px-4 py-3 font-medium text-primary-600">Completed</td>
                <td className="px-4 py-3 text-gray-800">{formatSavings(row.savings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
