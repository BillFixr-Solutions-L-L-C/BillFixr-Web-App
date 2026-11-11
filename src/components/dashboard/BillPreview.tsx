/* eslint-disable @next/next/no-img-element */
// Shows the customer's own uploaded bill.
//
// Until 2026-11-11 this component took no props and rendered a fabricated
// one: patient "Dave J. Collins", dates "07/11-07/14", and ten line items
// of "$2,345" each. It was rendered on the dashboard's View modal and twice
// on Active Case — so a customer who had paid, uploaded their own bill and
// had it analysed could open it and be shown a different person's invented
// statement, under their own case.
//
// A placeholder on an empty screen is a placeholder. A placeholder shaped
// like a medical bill, attached to a real case, is a fabricated record. So
// this now renders the actual file or says plainly that it cannot — it
// never invents content.
type Props = {
  /** A URL for the uploaded document: an object URL for a file still in
   *  the browser, or a signed storage URL for one already uploaded. */
  src?: string | null;
  /** True when `src` points at an image rather than a PDF. */
  isImage?: boolean;
  fileName?: string | null;
};

export default function BillPreview({ src, isImage = true, fileName }: Props) {
  const frame =
    "aspect-[3/4] w-full overflow-hidden rounded-lg border border-gray-100 bg-white text-[11px] leading-normal text-gray-500";

  if (!src) {
    return (
      <div className={`${frame} flex flex-col items-center justify-center gap-2 px-6 text-center`}>
        <p className="text-sm font-semibold text-gray-600">No preview available</p>
        <p className="max-w-[26ch] text-xs text-gray-400">
          {fileName
            ? `We couldn't open ${fileName} for preview. You can still download it.`
            : "This bill has no file we can show yet."}
        </p>
      </div>
    );
  }

  if (!isImage) {
    // A PDF. An <object> degrades to its children where inline PDFs are
    // blocked, which is better than a blank box.
    return (
      <div className={frame}>
        <object data={src} type="application/pdf" className="h-full w-full">
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold text-gray-600">Preview not supported here</p>
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#0f7545] underline">
              Open {fileName ?? "the bill"} in a new tab
            </a>
          </div>
        </object>
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* A plain <img>, not next/image: the source is a blob: object URL or
          a short-lived signed URL, neither of which the image optimizer
          can fetch. */}
      <img
        src={src}
        alt={fileName ? `Preview of ${fileName}` : "Preview of your uploaded bill"}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
