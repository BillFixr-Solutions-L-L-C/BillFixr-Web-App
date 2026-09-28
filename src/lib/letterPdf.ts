import { PDFDocument, StandardFonts, degrees, type PDFFont } from "pdf-lib";
import { parseLetter, type LetterRun } from "@/lib/letterFormat";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const BULLET_INDENT = 18;

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };

function fontFor(fonts: Fonts, run: LetterRun): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

// The built-in PDF fonts only cover a limited character set; anything
// outside it is replaced with "?" rather than making the whole download
// throw.
function makeSafe(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text)
      .map((ch) => (/\s/.test(ch) ? " " : supported.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

type Word = { text: string; font: PDFFont };

// Baked into the file itself, unlike the on-screen overlay — a letter
// downloaded while the case is still in progress carries the mark with it.
function stampWatermark(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, label: string) {
  const size = 46;
  const width = font.widthOfTextAtSize(label, size);
  for (let row = 0; row < 4; row++) {
    page.drawText(label, {
      x: (PAGE_WIDTH - width) / 2 - 60,
      y: 130 + row * 180,
      size,
      font,
      rotate: degrees(24),
      opacity: 0.08,
    });
  }
}

export async function buildLetterPdf(text: string, watermark?: string | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const safe = makeSafe(fonts.regular);

  function startPage() {
    const created = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (watermark) stampWatermark(created, fonts.bold, watermark);
    return created;
  }

  let page = startPage();
  let y = PAGE_HEIGHT - MARGIN;

  function newLine() {
    y -= LINE_HEIGHT;
    if (y < MARGIN) {
      page = startPage();
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  for (const block of parseLetter(text)) {
    const indent = block.kind === "bullet" ? BULLET_INDENT : 0;
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - indent;

    const words: Word[] = block.runs.flatMap((run) =>
      run.text
        .split(/(\s+)/)
        .filter((part) => part.length > 0)
        .map((part) => ({ text: safe(part), font: fontFor(fonts, run) })),
    );

    let x = MARGIN + indent;
    if (block.kind === "bullet") {
      page.drawText("•", { x: MARGIN + 4, y, size: FONT_SIZE, font: fonts.regular });
    }

    for (const word of words) {
      const width = word.font.widthOfTextAtSize(word.text, FONT_SIZE);
      const isSpace = word.text.trim() === "";
      if (x + width > MARGIN + indent + maxWidth && !isSpace) {
        newLine();
        x = MARGIN + indent;
      }
      if (isSpace && x === MARGIN + indent) continue;
      page.drawText(word.text, { x, y, size: FONT_SIZE, font: word.font });
      x += width;
    }
    newLine();
  }

  return pdf.save();
}
