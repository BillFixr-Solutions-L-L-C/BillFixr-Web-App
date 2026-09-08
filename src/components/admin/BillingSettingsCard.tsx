"use client";

import { useState } from "react";

export default function BillingSettingsCard({ initialPercentage }: { initialPercentage: number }) {
  const [value, setValue] = useState(String(initialPercentage));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const percentage = Number(value);
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings/success-fee", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentage }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to save.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Billing Settings</h2>
      <p className="mb-4 text-sm text-gray-500">
        Success fee — the percentage of a customer&apos;s savings charged once a case is resolved with errors found.
      </p>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className="w-28 rounded-lg border border-gray-200 px-3 py-2 pr-7 text-sm"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-primary-600">Saved</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
