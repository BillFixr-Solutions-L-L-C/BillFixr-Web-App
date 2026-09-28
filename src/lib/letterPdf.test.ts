import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildLetterPdf } from "./letterPdf";

describe("buildLetterPdf", () => {
  it("produces a real PDF", async () => {
    const bytes = await buildLetterPdf("Dear Billing Department,\n\n**Please** review this *charge*.\n- item one");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("does not throw on characters the built-in fonts can't encode", async () => {
    await expect(buildLetterPdf("Total: $5 ✓ 😀 café")).resolves.toBeInstanceOf(Uint8Array);
  });

  it("bakes a watermark into every page while the case is in progress", async () => {
    const plain = await buildLetterPdf("Dear Billing,");
    const marked = await buildLetterPdf("Dear Billing,", "BillFixr");
    // The stamp is drawn content, so the marked file is strictly larger.
    expect(marked.byteLength).toBeGreaterThan(plain.byteLength);
    await expect(PDFDocument.load(marked)).resolves.toBeTruthy();
  });

  it("produces a clean file once the case is completed", async () => {
    const a = await buildLetterPdf("Dear Billing,", null);
    const b = await buildLetterPdf("Dear Billing,");
    expect(a.byteLength).toBe(b.byteLength);
  });

  it("flows a long letter onto extra pages", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Line ${i} of a very long appeal letter`).join("\n");
    const doc = await PDFDocument.load(await buildLetterPdf(long));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
