"use client";

import { useEffect, useState } from "react";
import { describeMissing, missingRequiredInformation, REQUIRED_LABELS } from "@/lib/requiredInformation";
import { useT } from "@/lib/i18n/client";

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

// The engine's answer, as the find-contact route projects it.
type EngineRecord = {
  providerName?: string | null;
  phone?: string | null;
  mailingAddress?: string | null;
  // Where to POST a dispute, which is a different question from
  // mailingAddress -- that is where the provider is registered with CMS,
  // usually the clinic. For a hospital that publishes no billing email,
  // and most do not, this is the whole answer.
  billingAddress?: string | null;
  billingAddressSource?: string | null;
  billingAddressConfirmed?: boolean;
  billingAddressReason?: string | null;
  billingAddressIsRemitTo?: boolean;
  npi?: string | null;
  facilityType?: string | null;
  billingUrl?: string | null;
  notes?: string | null;
  verificationStatus?: string | null;
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
// Labels come from REQUIRED_LABELS rather than being repeated here: they
// were duplicated, so a rename could land on the form and not in the
// message that tells someone which field is still missing.
const PERSONAL: Field[] = [
  { key: "clientName", label: REQUIRED_LABELS.clientName, required: true },
  { key: "email", label: "Email", readOnly: true },
  { key: "address", label: REQUIRED_LABELS.address, wide: true, required: true },
  { key: "clientHospitalNumber", label: REQUIRED_LABELS.clientHospitalNumber, required: true },
];

const HOSPITAL: Field[] = [
  { key: "hospitalName", label: REQUIRED_LABELS.hospitalName, required: true },
  { key: "billingManagerEmail", label: REQUIRED_LABELS.billingManagerEmail, required: true, searchable: true },
  { key: "hospitalAddress", label: REQUIRED_LABELS.hospitalAddress, wide: true, required: true },
  { key: "supportEmail", label: REQUIRED_LABELS.supportEmail, required: true, searchable: true },
  { key: "billingPhone", label: REQUIRED_LABELS.billingPhone, required: true },
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
  canSearch,
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
  // Whether the lookup has enough to go on. One hospital name covers
  // facilities in different towns -- Matthew Walker is in both Nashville
  // and Smyrna -- so without an address the search picks the wrong one and
  // looks confident about it. The button waits for the address.
  canSearch: boolean;
}) {
  const t = useT();
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
                    disabled={searchingKey === f.key || !canSearch}
                    title={canSearch ? undefined : "Add the hospital's address first"}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#0f7545] px-4 py-2 text-xs font-semibold text-[#0f7545] hover:bg-primary-50 disabled:opacity-60"
                  >
                    <SparkIcon />
                    {searchingKey === f.key ? t("info.searching") : t("info.searchByAi")}
                  </button>
                )}
              </div>
            )}
            {f.searchable && !canSearch && (
              <p className="mt-1 text-xs text-gray-500">
                Add the hospital&apos;s address first — it&apos;s what tells two facilities with the
                same name apart.
              </p>
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
          {t("info.edit")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!editing || saving}
          className="rounded-full bg-[#0f7545] px-10 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? t("info.saving") : t("info.save")}
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
  const t = useT();
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState<"personal" | "hospital" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [reading, setReading] = useState(true);
  const [searching, setSearching] = useState<keyof CaseInformation | null>(null);

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

  // What the engine answered, put in the boxes it belongs in.
  //
  // The app is a projection of the engine here. A lookup that finds no
  // published email is still a useful answer -- it carries the facility's
  // official name, its central billing address and its phone number from
  // the federal registry -- and all of that used to be fetched and thrown
  // away, which is why the button looked like it did nothing.
  //
  // Overwriting is the part to be careful about. A "listed" match came
  // from a name-prefix search of the registry, which is how a Smyrna bill
  // reached the Nashville campus; it may fill a blank box but must not
  // replace something the customer typed off their own bill. Only
  // "verified" -- a human-checked directory entry -- outranks what is
  // already there. Returns the labels of the boxes it changed.
  function applyEngineRecord(record: EngineRecord | undefined | null): string[] {
    if (!record) return [];
    const trusted = record.verificationStatus === "verified";
    const incoming: [keyof CaseInformation, string, string][] = [
      ["hospitalName", String(record.providerName ?? "").trim(), "the hospital name"],
      // The address the provider asks patients to post billing mail to
      // wins over the registry's. The registry holds where it is
      // REGISTERED with CMS, which for a health system is the clinic, not
      // the office that opens billing post -- a dispute sent there is
      // read by a receptionist, if at all.
      [
        "hospitalAddress",
        String(record.billingAddress ?? record.mailingAddress ?? "").trim(),
        "the billing address",
      ],
      ["billingPhone", String(record.phone ?? "").trim(), "the billing phone"],
    ];

    // Computed against the current values rather than inside the setState
    // updater: React does not run an updater synchronously, so collecting
    // the labels in there would return an empty list every time and the
    // note would never name a box.
    const changed: string[] = [];
    const patch: Partial<CaseInformation> = {};
    for (const [field, incomingValue, label] of incoming) {
      if (!incomingValue) continue;
      const current = String(values[field] ?? "").trim();
      if (current && !trusted) continue;
      if (current === incomingValue) continue;
      patch[field] = incomingValue;
      changed.push(label);
    }
    if (changed.length) setValues((v) => ({ ...v, ...patch }));
    return changed;
  }

  // The billing-manager and support addresses aren't printed on a bill, so
  // these buttons look the hospital up instead of reading the document.
  async function searchByAi(key: keyof CaseInformation) {
    // No address check here on purpose: the button is disabled on exactly
    // this condition, so a guard would be unreachable and untestable. The
    // route enforces the same rule where it can actually be reached, and
    // its 400 renders through the error path below.
    setSearching(key);

    const res = await fetch(`/api/dashboard/bills/${billId}/find-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send what's on screen: the hospital name may have just been typed
      // and not saved yet, and that's what the lookup searches on.
      body: JSON.stringify({
        field: key,
        hospitalName: values.hospitalName,
        hospitalAddress: values.hospitalAddress,
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setSearching(null);

    if (!res?.ok) {
      return;
    }

    const found = String(body?.value ?? "").trim();
    if (!found) {
      // No email is the normal outcome, not a failure: the federal registry
      // covers essentially every US provider and has no email field at all,
      // and only 3 of the 16 hospitals in the curated directory publish
      // one. What does come back is a billing phone number and a postal
      // address, so those are still filled into the boxes they belong in.
      //
      // The lookup used to explain itself underneath the field -- whether
      // the hospital was found, whether it publishes an email, where to
      // post the letter instead. Removed on request 2026-11-18: it read
      // like a log line on a form. The fields it finds still fill
      // themselves in; nothing is said about the ones it does not.
      applyEngineRecord(body?.fallback);
      return;
    }
    setValues((v) => (v[key]?.trim() ? v : { ...v, [key]: found }));
    // An email does not mean the rest of the record is uninteresting: the
    // same answer carries the registry's phone and billing address.
    applyEngineRecord(body?.fallback);
    // The route still reports where the address came from and whether it
    // could be confirmed (emailSource, emailConfirmed,
    // emailUnconfirmedReason). Nothing reads them here any more: the line
    // that named the source and flagged an unconfirmed address was the
    // one removed on 2026-11-18. The address is filled in either way, as
    // it was before -- what is gone is the sentence about it.
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
      {/* "of", not "off". Both are correct English -- reading a value off
          a document is idiomatic -- but the doubled letter reads as a typo
          on screen, and it was read as one. */}
      {reading && (
        <p className="text-center text-sm text-gray-500">{t("upload.readingDetails")}</p>
      )}

      <Section
        title={t("info.personal")}
        fields={PERSONAL}
        values={values}
        editing={editing === "personal"}
        onEdit={() => setEditing("personal")}
        onChange={change}
        onSave={() => save(true)}
        saving={saving && editing === "personal"}
        onSearch={searchByAi}
        searchingKey={searching}
        canSearch={Boolean(values.hospitalAddress.trim())}
      />

      <hr className="border-gray-200" />

      <Section
        title={t("info.hospital")}
        fields={HOSPITAL}
        values={values}
        editing={editing === "hospital"}
        onEdit={() => setEditing("hospital")}
        onChange={change}
        onSave={() => save(true)}
        saving={saving && editing === "hospital"}
        onSearch={searchByAi}
        searchingKey={searching}
        canSearch={Boolean(values.hospitalAddress.trim())}
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
      {savedNote && !error && <p className="text-center text-sm text-primary-600">{t("info.saved")}</p>}
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
          {saving ? t("info.saving") : t("info.saveInformation")}
        </button>
      </div>
    </div>
  );
}
