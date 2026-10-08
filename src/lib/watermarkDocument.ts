import { PDFDocument, StandardFonts, degrees, type PDFFont, type PDFPage } from "pdf-lib";

// Baked into the file itself, unlike WatermarkOverlay, which is CSS on the
// screen and so survives neither a download nor a screenshot. A case
// document taken away while the case is still in progress carries the mark
// with it.
export const WATERMARK_LABEL = "BillFixr";

export type WatermarkedFile = { bytes: Uint8Array; contentType: string; filename: string };

// Sized from the page rather than fixed, since these are arbitrary
// provider documents, not our own letters — see lib/letterPdf.ts for the
// fixed-page version used when we generate the appeal letter ourselves.
function stampPage(page: PDFPage, font: PDFFont, label: string) {
  const { width, height } = page.getSize();
  const size = Math.max(24, Math.min(width, height) * 0.09);
  const textWidth = font.widthOfTextAtSize(label, size);
  const step = size * 3.6;

  for (let y = step * 0.4; y < height; y += step) {
    page.drawText(label, {
      x: (width - textWidth) / 2 - size,
      y,
      size,
      font,
      rotate: degrees(24),
      opacity: 0.08,
    });
  }
}

async function stampPdf(bytes: Uint8Array, label: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    stampPage(page, font, label);
  }
  return pdf.save();
}

// pdf-lib cannot draw onto a PNG or JPEG, and compositing one would mean
// pulling in a native image library for the occasional scanned letter. The
// image is wrapped in a single-page PDF carrying the mark instead: the
// format only changes while the document is withheld, and the customer
// gets the untouched original once the case completes.
async function imageToStampedPdf(bytes: Uint8Array, contentType: string, label: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Copied into a clean buffer first: a Node Buffer is a Uint8Array view
  // onto a pooled slab at a non-zero offset, and pdf-lib's decoder reads
  // past the view and fails. Same class of cross-realm trap as the
  // `instanceof File` one noted in lib/billUpload.ts.
  const data = new Uint8Array(bytes);
  const image =
    contentType === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  stampPage(page, font, label);
  return pdf.save();
}

function asPdfName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "") || "document";
  return `${base}-watermarked.pdf`;
}

// Anything that isn't a PDF or an image we can embed is returned as-is —
// better to serve an unmarked file than to fail the download outright, and
// the upload route only accepts PDF, PNG and JPEG anyway.
export async function watermarkDocument(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  label: string = WATERMARK_LABEL,
): Promise<WatermarkedFile> {
  if (contentType === "application/pdf") {
    return { bytes: await stampPdf(bytes, label), contentType, filename };
  }
  if (contentType === "image/png" || contentType === "image/jpeg") {
    return {
      bytes: await imageToStampedPdf(bytes, contentType, label),
      contentType: "application/pdf",
      filename: asPdfName(filename),
    };
  }
  return { bytes, contentType, filename };
}
