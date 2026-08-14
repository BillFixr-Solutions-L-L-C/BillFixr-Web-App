import BillPreview from "@/components/dashboard/BillPreview";

const timeline = [
  { title: "Negotiation Letter Sent", subtitle: "Negotiation Letter Sent", date: "Aug 17, 2026" },
  { title: "Client Reply Received", date: "Aug 17, 2026" },
  { title: "Negotiation Letter Sent", subtitle: "Negotiation Letter Sent", date: "Aug 17, 2026" },
];

const replyDrafts = [
  "Reply, response to Clinton Joe Reply, response to...",
  "Reply, response to Clinton Joe Reply, response to...",
];

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Case Detail: {id}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Case Overview</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400">Client Name</p>
                <p className="text-sm font-medium text-gray-800">Dave J. Collins</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Case ID</p>
                <p className="text-sm font-medium text-gray-800">Case 6753</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <p className="text-sm font-medium text-gray-800">Pending</p>
              </div>
              <button type="button" className="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white">
                Under Review
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-primary-700">Original Bill</p>
              <BillPreview />
              <div className="mt-3 rounded-2xl border border-primary-100 py-3 text-center text-lg font-bold text-primary-700">
                Original Bill
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">OCR Data Extraction</h3>
                <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Key Field</span>
                    <span className="text-gray-800">Client Hugg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Case ID</span>
                    <span className="text-gray-800">5673</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Case Data</span>
                    <span className="text-gray-800">Case 5673</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">OCR Data Value</span>
                    <span className="text-gray-800">$85.00</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">AI Analysis &amp; Risk Assessment</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-semibold text-red-500">High</span>
                    <span className="text-gray-500">Identified Issues</span>
                    <span className="text-gray-800">Risk-60%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-accent-600">Medium</span>
                    <span className="text-gray-500">Identified Issues</span>
                    <span className="text-gray-800">30-60%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-primary-600">Low</span>
                    <span className="text-gray-500">Povalies Confidence</span>
                    <span className="text-gray-800">60%</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Negotiation &amp; Communication</h3>
                <div className="relative pl-6">
                  <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gray-100" />
                  <div className="space-y-4">
                    {timeline.map((t, i) => (
                      <div key={i} className="relative flex items-start justify-between gap-2">
                        <span className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500 shadow" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                          {t.subtitle && <p className="text-xs text-gray-400">{t.subtitle}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">{t.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
              Manual Override &amp; Administrative Controls
            </h2>
            <label className="text-sm text-gray-600">Manual Notes</label>
            <textarea rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <label className="mt-3 block text-sm text-gray-600">Override Reason</label>
            <input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <label className="mt-3 block text-sm text-gray-600">Approval Chain</label>
            <input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />

            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className="rounded-full bg-primary-600 py-2 text-sm font-semibold text-white">
                Manual Approve
              </button>
              <button type="button" className="rounded-full bg-red-500 py-2 text-sm font-semibold text-white">
                Log Out
              </button>
              <button type="button" className="rounded-full bg-red-100 py-2 text-sm font-semibold text-red-500">
                Deny &amp; Escalate
              </button>
              <button type="button" className="rounded-full bg-gray-100 py-2 text-sm font-semibold text-gray-400">
                Re-Run AI Analysis
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Reply Drafts</h2>
            <div className="space-y-3">
              {replyDrafts.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-gray-50 pt-3 first:border-0 first:pt-0">
                  <p className="text-xs text-gray-500">{d}</p>
                  <button type="button" className="shrink-0 rounded-lg border border-gray-200 px-3 py-1 text-xs">
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
