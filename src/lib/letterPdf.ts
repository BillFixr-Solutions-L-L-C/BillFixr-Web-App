import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
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

export async function buildLetterPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const safe = makeSafe(fonts.regular);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newLine() {
    y -= LINE_HEIGHT;
    if (y < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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
