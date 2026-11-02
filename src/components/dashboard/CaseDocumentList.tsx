"use client";

import { useState } from "react";
import type { CaseDocumentRow } from "@/lib/caseDocuments";
import DocumentViewer from "./DocumentViewer";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CaseDocumentList({
  documents,
  title,
}: {
  documents: CaseDocumentRow[];
  /** Rendered inside the card, where every other section on the admin
      case screen keeps its heading. The customer's page has its own
      heading above and passes none. */
  title?: string;
}) {
  // View opens the document over this page rather than navigating away to
  // it. Working through a case means opening several of these in turn, and
  // the old target="_blank" link lost the case from view every time.
  const [viewing, setViewing] = useState<CaseDocumentRow | null>(null);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {title && <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>}
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
              {doc.sublabel && <p className="truncate text-xs text-gray-400">{doc.sublabel}</p>}
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
            {/* Downloadable wherever this list renders. On the customer
                side that is Completed Case only, and a completed case is
                paid for — Active Case keeps its documents view-only. On
                the admin side the team is working the case, so there is
                nothing to withhold. */}
            <div className="flex w-36 shrink-0 items-center justify-end gap-3">
              {doc.previewUrl ? (
                <button
                  type="button"
                  onClick={() => setViewing(doc)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  👁 View
                </button>
              ) : (
                <span className="text-sm text-gray-300">👁 View</span>
              )}
              {/* Still a real link: a download should download, and an
                  anchor is what makes the browser do that. */}
              {doc.downloadUrl ? (
                <a
                  href={doc.downloadUrl}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  ⬇ Download
                </a>
              ) : (
                <span className="text-sm text-gray-300">⬇ Download</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {viewing?.previewUrl && (
        <DocumentViewer
          title={viewing.label}
          filename={viewing.sublabel}
          url={viewing.previewUrl}
          downloadUrl={viewing.downloadUrl}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
