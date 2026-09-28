"use client";

import { useState } from "react";
import { EMPTY_VALUE, isEmptyValue, type HeaderField, type HeaderKey } from "@/lib/headerInfo";

// billId is set only when the details came from a real AI analysis —
// that's when there is something stored to edit. Without it (the sample
// content shown before any analysis exists) the card is read-only.
export default function HeaderInformationCard({
  fields,
  billId = null,
}: {
  fields: HeaderField[];
  billId?: string | null;
}) {
  const [saved, setSaved] = useState<Record<HeaderKey, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value])) as Record<HeaderKey, string>,
  );
  const [draft, setDraft] = useState<Record<HeaderKey, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function startEditing() {
    setError(null);
    setJustSaved(false);
    setDraft(
      Object.fromEntries(fields.map((f) => [f.key, isEmptyValue(saved[f.key]) ? "" : saved[f.key]])) as Record<
        HeaderKey,
        string
      >,
    );
  }

  async function save() {
    if (!draft || !billId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/dashboard/documents/${billId}/header-info`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "We couldn't save your changes. Please try again.");
      return;
    }
    setSaved(
      Object.fromEntries(
        fields.map((f) => [f.key, draft[f.key].trim() || EMPTY_VALUE[f.key]]),
      ) as Record<HeaderKey, string>,
    );
    setDraft(null);
    setJustSaved(true);
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Header Information</p>
        {billId && !draft && (
          <button
            type="button"
            onClick={startEditing}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            ✎ Edit
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
        {fields.map((f) => (
          <div key={f.key}>
            {draft ? (
              <>
                <label htmlFor={`header-${f.key}`} className="text-xs text-gray-400">
                  {f.label}
                </label>
                <input
                  id={`header-${f.key}`}
                  type={f.kind === "date" ? "date" : "text"}
                  value={draft[f.key]}
                  placeholder={EMPTY_VALUE[f.key]}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:border-primary-400 focus:outline-none"
                />
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{saved[f.key]}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[#0f7545] px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={saving}
            className="rounded-full border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
      {justSaved && !draft && <p className="mt-3 text-xs text-primary-600">Saved.</p>}
    </div>
  );
}
