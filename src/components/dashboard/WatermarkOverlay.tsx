// A faded, repeating BillFixr mark laid over a document while its case is
// still in progress. It disappears once the case is completed.
//
// This covers what is shown on screen. It is not a substitute for the
// stamp baked into generated PDFs (see lib/letterPdf.ts) — an overlay
// cannot travel with a file the customer downloads.
export default function WatermarkOverlay({ label = "BillFixr" }: { label?: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-around overflow-hidden select-none"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex -rotate-[24deg] justify-around whitespace-nowrap">
          {[0, 1, 2].map((col) => (
            <span
              key={col}
              className="px-6 text-lg font-bold uppercase tracking-[0.3em] text-[#0f7545]/15"
            >
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
