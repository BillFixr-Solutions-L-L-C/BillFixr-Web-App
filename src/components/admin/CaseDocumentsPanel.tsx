"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CASE_DOCUMENT_TYPES, CASE_DOCUMENT_LABELS, type CaseDocumentType } from "@/lib/caseDocuments";

// Staff-side upload for the provider-originated documents the customer
// sees on their Completed Case page.
//
// This used to list the documents already on the case as plain filenames
// with no way to open them. The Case Documents list on the same screen
// now shows the whole set with view and download links, so this is the
// upload form and nothing else — and nothing at all to an admin who
// cannot upload.
export default function CaseDocumentsPanel({
  caseId,
  canWrite,
}: {
  caseId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<CaseDocumentType>("new_bill");
  const [adjustedTotal, setAdjustedTotal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After the hooks, not before — the rules of hooks do not care that the
  // answer never changes within a render.
  if (!canWrite) return null;

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.append("type", type);
    if (type === "new_bill" && adjustedTotal.trim()) body.append("adjustedTotal", adjustedTotal.trim());
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
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Upload a Provider Document</h2>

      <div className="space-y-2">
          {type === "new_bill" && (
            <div className="mb-3">
              <label htmlFor="case-adjusted-total" className="text-xs text-gray-500">
                Adjusted total (optional)
              </label>
              <input
                id="case-adjusted-total"
                type="number"
                min="0"
                step="0.01"
                value={adjustedTotal}
                onChange={(e) => setAdjustedTotal(e.target.value)}
                placeholder="e.g. 2500"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">
                The corrected balance. Shown to the customer beside the overcharge.
              </p>
            </div>
          )}
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
    </div>
  );
}
