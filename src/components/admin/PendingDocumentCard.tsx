export default function PendingDocumentCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-700">{label}</p>
      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 p-4 text-center">
        <span className="text-xs font-medium text-gray-500">Not generated yet</span>
        <span className="text-[11px] text-gray-400">Pending AI negotiation</span>
      </div>
    </div>
  );
}
