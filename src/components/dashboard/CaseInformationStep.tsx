"use client";

import { useState } from "react";

export type CaseInformation = {
  clientName: string;
  email: string;
  address: string;
  nextgenNumber: string;
  hospitalName: string;
  billingManagerEmail: string;
  hospitalAddress: string;
  billingPhone: string;
};

type Field = { key: keyof CaseInformation; label: string; wide?: boolean; readOnly?: boolean };

const PERSONAL: Field[] = [
  { key: "clientName", label: "Client Name" },
  { key: "email", label: "Email", readOnly: true },
  { key: "address", label: "Address", wide: true },
  { key: "nextgenNumber", label: "NextGen Number" },
];

// Figma lists "Billing Manager Email" twice in this section; the second is
// a design slip, so the four distinct fields are used here.
const HOSPITAL: Field[] = [
  { key: "hospitalName", label: "Hospital Name" },
  { key: "billingManagerEmail", label: "Billing Manager Email" },
  { key: "hospitalAddress", label: "Address", wide: true },
  { key: "billingPhone", label: "Billing Phone Number" },
];

function Section({
  title,
  fields,
  values,
  editing,
  onEdit,
  onChange,
  onSave,
  saving,
}: {
  title: string;
  fields: Field[];
  values: CaseInformation;
  editing: boolean;
  onEdit: () => void;
  onChange: (key: keyof CaseInformation, value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-bold text-gray-900">{title}</h2>
      <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.wide ? "sm:row-span-2" : undefined}>
            <label htmlFor={`info-${f.key}`} className="text-sm text-gray-600">
              {f.label}
            </label>
            {f.wide ? (
              <textarea
                id={`info-${f.key}`}
                rows={3}
                value={values[f.key]}
                readOnly={!editing || f.readOnly}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="mt-1 w-full rounded-xl border border-primary-200 px-4 py-2.5 text-sm text-primary-800 read-only:bg-gray-50 read-only:text-gray-500 focus:border-primary-400 focus:outline-none"
              />
            ) : (
              <input
                id={`info-${f.key}`}
                type="text"
                value={values[f.key]}
                readOnly={!editing || f.readOnly}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="mt-1 w-full rounded-xl border border-primary-200 px-4 py-2.5 text-sm text-primary-800 read-only:bg-gray-50 read-only:text-gray-500 focus:border-primary-400 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-4">
        <button
          type="button"
          onClick={onEdit}
          disabled={editing}
          className="rounded-full border border-gray-200 px-10 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!editing || saving}
          className="rounded-full bg-[#0f7545] px-10 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

export default function CaseInformationStep({
  billId,
  initial,
  previews,
  onContinue,
}: {
  billId: string;
  initial: CaseInformation;
  previews: string[];
  onContinue: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState<"personal" | "hospital" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  function change(key: keyof CaseInformation, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSavedNote(false);
  }

  async function save(closeSection: boolean) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/dashboard/bills/${billId}/information`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "We couldn't save your information. Please try again.");
      return false;
    }
    if (closeSection) setEditing(null);
    setSavedNote(true);
    return true;
  }

  return (
    <div className="space-y-10">
      <Section
        title="Personal Information"
        fields={PERSONAL}
        values={values}
        editing={editing === "personal"}
        onEdit={() => setEditing("personal")}
        onChange={change}
        onSave={() => save(true)}
        saving={saving && editing === "personal"}
      />

      <hr className="border-gray-200" />

      <Section
        title="Hospital Information"
        fields={HOSPITAL}
        values={values}
        editing={editing === "hospital"}
        onEdit={() => setEditing("hospital")}
        onChange={change}
        onSave={() => save(true)}
        saving={saving && editing === "hospital"}
      />

      {previews.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap justify-center gap-5">
            {previews.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-60 w-auto rounded-lg border border-gray-100 object-cover" />
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-center text-sm text-danger">{error}</p>}
      {savedNote && !error && <p className="text-center text-sm text-primary-600">Information saved.</p>}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={async () => {
            if (await save(true)) onContinue();
          }}
          disabled={saving}
          className="rounded-full bg-[#0f7545] px-12 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Information"}
        </button>
      </div>
    </div>
  );
}
