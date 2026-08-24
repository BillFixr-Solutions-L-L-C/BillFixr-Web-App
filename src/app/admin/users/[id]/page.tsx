import BillPreview from "@/components/dashboard/BillPreview";
import LetterPreview from "@/components/admin/LetterPreview";

function Field({ label, defaultValue, type = "text" }: { label: string; defaultValue: string; type?: string }) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        readOnly
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
      />
    </div>
  );
}

const documents = [
  { label: "Original Bill", preview: <BillPreview /> },
  { label: "Adjusted Bill", preview: <BillPreview /> },
  { label: "AI Generated Letter", preview: <LetterPreview /> },
  { label: "Provider Letter", preview: <LetterPreview /> },
];

export default function AdminUserDetailPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Customers</h1>

      <div className="flex flex-wrap items-center gap-6">
        <span className="h-20 w-20 shrink-0 rounded-full bg-primary-100" />
        <div className="flex flex-wrap gap-6 text-sm text-gray-500 sm:gap-10">
          <div>
            <p>Date Joined:</p>
            <p className="mt-1 font-medium text-gray-800">25/06/25</p>
          </div>
          <div>
            <p>Orders Made:</p>
            <p className="mt-1 font-medium text-gray-800">07</p>
          </div>
          <div>
            <p>Styling Requests:</p>
            <p className="mt-1 font-medium text-gray-800">05</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Field label="Full name" defaultValue="Charlene Reed" />
        <Field label="Nickname" defaultValue="Charlene Reed" />
        <Field label="Email" defaultValue="charlenereed@gmail.com" />
        <Field label="Address" defaultValue="USA" />
        <Field label="Password" defaultValue="charlene123" type="password" />
        <Field label="Phone" defaultValue="234 81305965" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {documents.map((doc) => (
          <div key={doc.label} className="rounded-xl border border-gray-100 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{doc.label}</p>
              <button type="button" className="flex items-center gap-1 text-xs text-primary-600">
                ⬇ Download as PDF
              </button>
            </div>
            {doc.preview}
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          className="rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
        >
          Suspend account
        </button>
        <button
          type="button"
          className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
