"use client";

import { useState } from "react";

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none"
      />
    </div>
  );
}

type Profile = {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save profile.");
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-8">
      <div className="relative h-20 w-20 shrink-0">
        <div className="h-20 w-20 rounded-full bg-primary-100" />
        <button
          type="button"
          aria-label="Edit photo"
          className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs text-white ring-2 ring-white"
        >
          ✎
        </button>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Your Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field label="Email" readOnly value={form.email} />
        <Field
          label="Address"
          required
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Field
          label="City"
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <Field
          label="Postal Code"
          required
          value={form.postalCode}
          onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
        />
        <Field
          label="Country"
          required
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
        />

        {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
        {saved && <p className="sm:col-span-2 text-sm text-primary-600">Profile saved.</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
