export default function BillPreview() {
  return (
    <div className="aspect-[3/4] w-full rounded-lg border border-gray-100 bg-white p-4 text-[6px] leading-tight text-gray-400">
      <div className="rounded bg-primary-50 p-2">
        <p className="font-semibold text-primary-700">Itemization of Hospital Services</p>
        <div className="mt-1 flex justify-between">
          <span>Patient Name</span>
          <span>Dave J. Collins</span>
        </div>
        <div className="flex justify-between">
          <span>Dates of Service</span>
          <span>07/11-07/14</span>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex justify-between border-b border-gray-50 pb-1">
            <span>Line item {i + 1}</span>
            <span>$2,345</span>
          </div>
        ))}
      </div>
    </div>
  );
}
