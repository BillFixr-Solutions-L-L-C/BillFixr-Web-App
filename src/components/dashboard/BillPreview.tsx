export default function BillPreview() {
  return (
    <div className="aspect-[3/4] w-full rounded-lg border border-gray-100 bg-white p-5 text-[11px] leading-normal text-gray-500">
      <div className="rounded bg-primary-50 p-3">
        <p className="text-sm font-semibold text-primary-700">Itemization of Hospital Services</p>
        <div className="mt-2 flex justify-between">
          <span>Patient Name</span>
          <span>Dave J. Collins</span>
        </div>
        <div className="flex justify-between">
          <span>Dates of Service</span>
          <span>07/11-07/14</span>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex justify-between border-b border-gray-50 pb-1.5">
            <span>Line item {i + 1}</span>
            <span>$2,345</span>
          </div>
        ))}
      </div>
    </div>
  );
}
