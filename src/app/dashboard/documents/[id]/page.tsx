const headerInfo = [
  { label: "Member name", value: "Dave J. Collins" },
  { label: "Member ID", value: "UCH-810-4474" },
  { label: "Group", value: "No group found" },
  { label: "Claim number", value: "No claim found" },
  { label: "Provider name", value: "Crown Med Hospital Center" },
  { label: "Account number", value: "SHDE-20982-098765" },
  { label: "Date of service", value: "2026-07-14" },
  { label: "Statement date", value: "2026-07-14" },
];

const amountBreakdown = [
  { label: "Total charged", current: "$2,345", original: "$2,345", difference: "$2,345" },
  { label: "Insurance paid", current: "$2,345", original: "$2,345", difference: "$2,345" },
  { label: "Patient responsibility", current: "$2,345", original: "$2,345", difference: "$2,345" },
];

const lineItems = [
  { date: "2026-07-15", description: "ER Facility E&M Level 4 ...", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: null },
  { date: "2026-07-15", description: "ER Facility E&M Level 4 ...", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: "Insurance Coverage Error" },
  { date: "2026-07-15", description: "Paracetamol drug 500g", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: null },
  { date: "2026-07-15", description: "LRC Lab", billed: "$2,345", insurance: "$2,345", responsibility: "$2,345", status: "Mathematical Error" },
];

export default function DocumentAnalysisPage() {
  return (
    <div>
      <h1 className="font-serif text-4xl font-bold text-gray-900">Analysis Complete - Errors Found</h1>
      <p className="mt-2 text-gray-500">We&apos;ve identify potential issues and opportunity to savivings</p>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">AI Bill Analysis</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin ultricies fringilla
          diam, a egestas tellus ultricies et. Maecenas nec erat non nulla commodo ultricies at
          eu nisl. Proin egestas, nisi a tristique commodo, libero nulla convallis felis, eget
          pretium tellus tortor id nisl. Aliquam a auctor nisi. Maecenas
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Header Information</p>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
            {headerInfo.map((f) => (
              <div key={f.label}>
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Files</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-accent-500">📄</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Crown Med Hosp...</p>
                <p className="text-xs text-gray-400">205kb</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-primary-600">✓ Uploaded</span>
              <button type="button" className="text-primary-600">
                👁 View
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Errors Found</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">10</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Estimated Savings</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">$2,500</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Detected Issues</p>
          <span className="mt-2 inline-block rounded-full bg-danger-bg px-3 py-1 text-xs font-medium text-danger">
            Insurance coverage error
          </span>
          <p className="mt-2 text-sm font-semibold text-gray-800">Mathematical Error</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-primary-700">Total Amount Breakdown</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3" />
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Original (AI Extracted)</th>
                <th className="px-4 py-3">Difference</th>
              </tr>
            </thead>
            <tbody>
              {amountBreakdown.map((row) => (
                <tr key={row.label} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-600">{row.label}</td>
                  <td className="px-4 py-3 text-gray-800">{row.current}</td>
                  <td className="px-4 py-3 text-gray-800">{row.original}</td>
                  <td className="px-4 py-3 text-gray-800">{row.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary-700">Line Items</p>
          <span className="rounded-full bg-danger-bg px-3 py-1 text-xs font-medium text-danger">
            2 Error Found
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Billed Amount</th>
                <th className="px-4 py-3">Insurance Paid</th>
                <th className="px-4 py-3">Your Responsibility</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-600">{item.date}</td>
                  <td className="px-4 py-3 text-gray-800">{item.description}</td>
                  <td className="px-4 py-3 text-gray-800">{item.billed}</td>
                  <td className="px-4 py-3 text-gray-800">{item.insurance}</td>
                  <td className="px-4 py-3 text-gray-800">{item.responsibility}</td>
                  <td className="px-4 py-3">
                    {item.status && (
                      <span className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger">
                        {item.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Over Billed</p>
            <p className="mt-2 text-xl font-bold text-danger">$5590</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Adjusted Charges</p>
            <p className="mt-2 text-xl font-bold text-primary-600">$2500</p>
          </div>
        </div>

        <span className="rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white">
          Completed
        </span>
      </div>
    </div>
  );
}
