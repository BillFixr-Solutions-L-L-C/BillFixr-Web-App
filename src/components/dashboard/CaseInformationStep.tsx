"use client";

import { useEffect, useState } from "react";
import { describeMissing, missingRequiredInformation } from "@/lib/requiredInformation";

// Fields the AI can read straight off the uploaded bill. The two email
// addresses are deliberately absent — they aren't printed on a bill and
// are looked up separately via the "Search by AI" buttons.
const FROM_BILL = [
  "clientName",
  "address",
  "hospitalName",
  "hospitalAddress",
  "billingPhone",
] as const satisfies readonly (keyof CaseInformation)[];

function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.9 4.9L19 9.8l-4.9 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3Z"
        fill="currentColor"
      />
      <path d="M18.5 15l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.2-.8 2.2-.8.8-2.1Z" fill="currentColor" />
    </svg>
  );
}

export type CaseInformation = {
  clientName: string;
  email: string;
  address: string;
  clientHospitalNumber: string;
  hospitalName: string;
  billingManagerEmail: string;
  hospitalAddress: string;
  supportEmail: string;
  billingPhone: string;
};

type Field = {
  key: keyof CaseInformation;
  label: string;
  wide?: boolean;
  readOnly?: boolean;
  required?: boolean;
  // Figma places a "Search by AI" button beside the two email fields.
  searchable?: boolean;
};

// Everything is required except Email, which comes from the account and
// can't be edited here.
const PERSONAL: Field[] = [
  { key: "clientName", label: "Client Name", required: true },
  { key: "email", label: "Email", readOnly: true },
  { key: "address", label: "Address", wide: true, required: true },
  { key: "clientHospitalNumber", label: "Client Hospital Number", required: true },
];

const HOSPITAL: Field[] = [
  { key: "hospitalName", label: "Hospital Name", required: true },
  { key: "billingManagerEmail", label: "Billing Manager Email", required: true, searchable: true },
  { key: "hospitalAddress", label: "Address", wide: true, required: true },
  { key: "supportEmail", label: "Support Email", required: true, searchable: true },
  { key: "billingPhone", label: "Billing Phone Number", required: true },
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
  onSearch,
  searchingKey,
  notes,
}: {
  title: string;
  fields: Field[];
  values: CaseInformation;
  editing: boolean;
  onEdit: () => void;
  onChange: (key: keyof CaseInformation, value: string) => void;
  onSave: () => void;
  saving: boolean;
  onSearch: (key: keyof CaseInformation) => void;
  searchingKey: keyof CaseInformation | null;
  notes: Partial<Record<keyof CaseInformation, string>>;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-bold text-gray-900">{title}</h2>
      <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.wide ? "sm:row-span-2" : undefined}>
            <label htmlFor={`info-${f.key}`} className="text-sm text-gray-600">
              {f.label}
              {f.required && <span className="ml-1 text-danger">*</span>}
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
              // Figma puts a "Search by AI" button immediately to the right
              // of the field it fills (the two email fields).
              <div className="mt-1 flex items-center gap-3">
                <input
                  id={`info-${f.key}`}
                  type="text"
                  value={values[f.key]}
                  readOnly={!editing || f.readOnly}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-primary-200 px-4 py-2.5 text-sm text-primary-800 read-only:bg-gray-50 read-only:text-gray-500 focus:border-primary-400 focus:outline-none"
                />
                {f.searchable && (
                  <button
                    type="button"
                    onClick={() => onSearch(f.key)}
                    disabled={searchingKey === f.key}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#0f7545] px-4 py-2 text-xs font-semibold text-[#0f7545] hover:bg-primary-50 disabled:opacity-60"
                  >
                    <SparkIcon />
                    {searchingKey === f.key ? "Searching…" : "Search by AI"}
                  </button>
                )}
              </div>
            )}
            {notes[f.key] && <p className="mt-1 text-xs text-gray-500">{notes[f.key]}</p>}
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
  const [reading, setReading] = useState(true);
  const [searching, setSearching] = useState<keyof CaseInformation | null>(null);
  const [searchNote, setSearchNote] = useState<Partial<Record<keyof CaseInformation, string>>>({});

  // Everything that IS printed on the bill is read off it as soon as the
  // step opens, so the customer corrects rather than types. Only blanks are
  // filled, and the two email fields are left out — see searchByAi.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/dashboard/bills/${billId}/extract`, { method: "POST" }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (cancelled || !res?.ok || !body?.fields) {
        if (!cancelled) setReading(false);
        return;
      }
      setValues((v) => {
        const next = { ...v };
        for (const key of FROM_BILL) {
          const found = String(body.fields[key] ?? "").trim();
          if (found && !next[key]?.trim()) next[key] = found;
        }
        return next;
      });
      setReading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [billId]);

  // The billing-manager and support addresses aren't printed on a bill, so
  // these buttons look the hospital up instead of reading the document.
  async function searchByAi(key: keyof CaseInformation) {
    setSearching(key);
    setSearchNote((n) => ({ ...n, [key]: "" }));

    const res = await fetch(`/api/dashboard/bills/${billId}/find-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: key }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setSearching(null);

    if (!res?.ok) {
      setSearchNote((n) => ({
        ...n,
        [key]: body?.error ?? "We couldn't search for this — please type it in.",
      }));
      return;
    }

    const found = String(body?.value ?? "").trim();
    if (!found) {
      setSearchNote((n) => ({ ...n, [key]: "We couldn't find an address for this hospital." }));
      return;
    }
    setValues((v) => (v[key]?.trim() ? v : { ...v, [key]: found }));
    setSearchNote((n) => ({ ...n, [key]: "Found — check it's right." }));
  }

  const missing = missingRequiredInformation({
    clientName: values.clientName,
    address: values.address,
    clientHospitalNumber: values.clientHospitalNumber,
    hospitalName: values.hospitalName,
    billingManagerEmail: values.billingManagerEmail,
    hospitalAddress: values.hospitalAddress,
    supportEmail: values.supportEmail,
    billingPhone: values.billingPhone,
  });

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
      {reading && (
        <p className="text-center text-sm text-gray-500">Reading the details off your bill…</p>
      )}

      <Section
        title="Personal Information"
        fields={PERSONAL}
        values={values}
        editing={editing === "personal"}
        onEdit={() => setEditing("personal")}
        onChange={change}
        onSave={() => save(true)}
        saving={saving && editing === "personal"}
        onSearch={searchByAi}
        searchingKey={searching}
        notes={searchNote}
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
        onSearch={searchByAi}
        searchingKey={searching}
        notes={searchNote}
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
      {missing.length > 0 && !error && (
        <p className="text-center text-sm text-accent-600">{describeMissing(missing)}</p>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={async () => {
            if (await save(true)) onContinue();
          }}
          disabled={saving || missing.length > 0}
          title={missing.length > 0 ? describeMissing(missing) : undefined}
          className="rounded-full bg-[#0f7545] px-12 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Information"}
        </button>
      </div>
    </div>
  );
}
