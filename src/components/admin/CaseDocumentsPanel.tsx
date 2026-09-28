"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CASE_DOCUMENT_LABELS, CASE_DOCUMENT_TYPES, type CaseDocumentType } from "@/lib/caseDocuments";

export type ExistingCaseDocument = { id: string; type: string; filename: string; created_at: string };

// Staff-side upload for the provider-originated documents the customer
// sees on their Completed Case page.
export default function CaseDocumentsPanel({
  caseId,
  existing,
  canWrite,
}: {
  caseId: string;
  existing: ExistingCaseDocument[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<CaseDocumentType>("new_bill");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.append("type", type);
    body.append("file", file);

    const res = await fetch(`/api/admin/cases/${caseId}/documents`, { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError(payload?.error ?? "Upload failed. Please try again.");
      return;
    }
    setFile(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Case Documents</h2>

      {existing.length === 0 ? (
        <p className="text-xs text-gray-400">No provider documents uploaded yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {existing.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 border-t border-gray-50 pt-2 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-gray-800">
                  {CASE_DOCUMENT_LABELS[doc.type as CaseDocumentType] ?? doc.type}
                </p>
                <p className="truncate text-xs text-gray-400">{doc.filename}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="space-y-2 border-t border-gray-50 pt-3">
          <label htmlFor="case-doc-type" className="text-xs text-gray-500">
            Document type
          </label>
          <select
            id="case-doc-type"
            value={type}
            onChange={(e) => setType(e.target.value as CaseDocumentType)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
          >
            {CASE_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CASE_DOCUMENT_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            aria-label="Document file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={upload}
            disabled={!file || uploading}
            className="w-full rounded-full bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload document"}
          </button>
        </div>
      )}
    </div>
  );
}
