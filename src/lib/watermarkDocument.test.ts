import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { watermarkDocument } from "./watermarkDocument";

// A real 1x1 PNG, so pdf-lib's decoder is genuinely exercised.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function makePdf(pages = 2): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([400, 600]);
  return pdf.save();
}

describe("watermarkDocument", () => {
  it("stamps a PDF and keeps it a PDF with the same name", async () => {
    const source = await makePdf();
    const result = await watermarkDocument(source, "application/pdf", "letter.pdf");

    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("letter.pdf");
    // Still a readable PDF with its pages intact, just heavier for the mark.
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(2);
    expect(result.bytes.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("marks every page, not just the first", async () => {
    const one = await watermarkDocument(await makePdf(1), "application/pdf", "a.pdf");
    const five = await watermarkDocument(await makePdf(5), "application/pdf", "a.pdf");

    const perPage = (five.bytes.byteLength - one.bytes.byteLength) / 4;
    expect(perPage).toBeGreaterThan(0);
  });

  it("wraps an image in a stamped PDF, renaming it so it is obviously not the original", async () => {
    const result = await watermarkDocument(PNG_1X1, "image/png", "scan.png");

    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("scan-watermarked.pdf");
    await expect(PDFDocument.load(result.bytes)).resolves.toBeDefined();
  });

  it("passes through anything it cannot mark rather than failing the download", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await watermarkDocument(bytes, "application/octet-stream", "mystery.bin");

    expect(result.bytes).toBe(bytes);
    expect(result.filename).toBe("mystery.bin");
    expect(result.contentType).toBe("application/octet-stream");
  });

  it("copes with a filename that has no extension", async () => {
    const result = await watermarkDocument(PNG_1X1, "image/png", "scan");
    expect(result.filename).toBe("scan-watermarked.pdf");
  });
});
