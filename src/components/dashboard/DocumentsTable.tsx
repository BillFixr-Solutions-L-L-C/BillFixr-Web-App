import Link from "next/link";

export type DocumentRow = {
  key: string;
  label: string;
  provider: string;
  date: string | null;
  previewUrl: string | null;
  href: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DocumentsTable({ rows }: { rows: DocumentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Your documents will appear here once your bill has been reviewed.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 text-gray-800">
                  <span className="text-accent-500">📄</span>
                  {row.label}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{row.provider}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(row.date)}</td>
              <td className="px-4 py-3 text-right">
                {row.href ? (
                  <Link href={row.href} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                    View
                  </Link>
                ) : row.previewUrl ? (
                  <a
                    href={row.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-sm text-gray-300">View</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
