import type { CaseDocumentRow } from "@/lib/caseDocuments";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CaseDocumentList({ documents }: { documents: CaseDocumentRow[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <ul>
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-center gap-4 border-b border-gray-50 py-4 last:border-b-0"
          >
            <span className={`text-xl ${doc.available ? "text-accent-500" : "text-gray-300"}`} aria-hidden="true">
              📄
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${doc.available ? "text-gray-800" : "text-gray-400"}`}>
                {doc.label}
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-xs">
                {doc.sizeLabel && <span className="text-gray-400">{doc.sizeLabel}</span>}
                {doc.available ? (
                  <span className="text-primary-600">✓ {doc.status}</span>
                ) : (
                  <span className="text-gray-400">Not available yet</span>
                )}
              </p>
            </div>
            <p className="w-32 shrink-0 text-sm text-gray-500">{formatDate(doc.date)}</p>
            <div className="w-16 shrink-0 text-right">
              {doc.previewUrl ? (
                <a
                  href={doc.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  👁 View
                </a>
              ) : (
                <span className="text-sm text-gray-300">👁 View</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
