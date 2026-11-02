"use client";

import { useEffect, useRef } from "react";

// Opens a document over the page it was opened from.
//
// View used to be a plain link with target="_blank", which handed the file
// to the browser's own PDF viewer in another tab. That is a fine way to
// read one document and a bad way to work through a case: the case is gone
// from view, and checking the next document means going back, finding the
// row again and opening another tab.
//
// The bytes are still served by the same URL, so nothing about who may read
// what changes here — this is only where the file is shown.

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;

export default function DocumentViewer({
  title,
  filename,
  url,
  downloadUrl,
  onClose,
}: {
  title: string;
  /** What the file is actually called, when the title is a label like
      "Provider Responses" rather than a filename. Only used to tell an
      image from a PDF. */
  filename?: string | null;
  url: string;
  downloadUrl?: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Escape closes, and the page behind does not scroll while this is open.
    //
    // Escape is best-effort, not a guarantee. Chrome's PDF viewer takes
    // focus when it loads, and a parent window never sees keys aimed at a
    // cross-origin frame — so once the document has focus this listener
    // stops hearing anything. Verified in a real browser, where Escape did
    // nothing while focus sat on the embedded PDF. The close button and a
    // click outside are the two ways out that always work, which is why
    // the button is always visible rather than appearing on hover.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const isImage = IMAGE.test(filename || title);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      // Only a click on the backdrop itself closes — a click that started
      // inside the document and drifted out should not.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          <div className="flex shrink-0 items-center gap-4">
            {downloadUrl && (
              <a href={downloadUrl} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                Download
              </a>
            )}
            {/* The escape hatch the old behaviour gave for free: printing,
                and anything the embedded viewer will not do. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Open in new tab
            </a>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full px-2 text-lg leading-none text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-gray-50">
          {isImage ? (
            // The URL is a signed, short-lived link to private storage,
            // which the image optimizer cannot fetch and should not cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={title} className="mx-auto h-full w-full object-contain" />
          ) : (
            <iframe
              src={url}
              title={title}
              className="h-full w-full border-0"
              // Takes focus back from the embedded document so Escape has
              // somewhere to land. It is a race against Chrome's PDF
              // viewer, which grabs focus as it initialises, and it does
              // not always win — see the note on the key listener above.
              onLoad={() => closeRef.current?.focus()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
