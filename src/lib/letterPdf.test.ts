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

  it("flows a long letter onto extra pages", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Line ${i} of a very long appeal letter`).join("\n");
    const doc = await PDFDocument.load(await buildLetterPdf(long));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
