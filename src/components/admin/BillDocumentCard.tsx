import type { BillDocument } from "@/lib/billDocuments";

function FileIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function BillDocumentCard({ doc, label }: { doc: BillDocument; label: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-primary-700">{label}</p>
        {doc.downloadUrl && (
          <a
            href={doc.downloadUrl}
            className="flex shrink-0 items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
          >
            ⬇ Download
          </a>
        )}
      </div>

      {doc.previewUrl ? (
        doc.isImage ? (
          <a href={doc.previewUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={doc.previewUrl}
              alt={doc.filename}
              className="aspect-[3/4] w-full rounded-lg border border-gray-100 object-cover"
            />
          </a>
        ) : (
          <a
            href={doc.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-4 text-center text-gray-400 hover:bg-gray-100"
          >
            <FileIcon />
            <span className="break-all text-[11px] text-gray-600">{doc.filename}</span>
            <span className="text-[10px] uppercase tracking-wide">View file</span>
          </a>
        )
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
          File unavailable
        </div>
      )}
    </div>
  );
}
