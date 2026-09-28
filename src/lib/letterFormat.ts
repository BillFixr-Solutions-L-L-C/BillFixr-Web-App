import { escapeHtml } from "@/lib/html";

// The appeal letter is stored as plain text in cases.appeal_letter_text.
// The editor's B / I / list buttons write light markdown-style markers
// (**bold**, *italic*, "- " bullets) so formatting survives without ever
// storing HTML; the PDF and the provider email both render from these
// markers, and every piece of text is escaped on the way out.

export type LetterRun = { text: string; bold: boolean; italic: boolean };
export type LetterBlock = { kind: "paragraph" | "bullet"; runs: LetterRun[] };

function parseRuns(line: string): LetterRun[] {
  const runs: LetterRun[] = [];
  let bold = false;
  let italic = false;
  let buffer = "";

  function flush() {
    if (buffer) runs.push({ text: buffer, bold, italic });
    buffer = "";
  }

  for (let i = 0; i < line.length; i++) {
    if (line.startsWith("**", i)) {
      flush();
      bold = !bold;
      i += 1;
    } else if (line[i] === "*") {
      flush();
      italic = !italic;
    } else {
      buffer += line[i];
    }
  }
  flush();
  return runs;
}

export function parseLetter(text: string): LetterBlock[] {
  return text.replace(/\r\n/g, "\n").split("\n").map((line) => {
    if (line.startsWith("- ")) return { kind: "bullet", runs: parseRuns(line.slice(2)) };
    return { kind: "paragraph", runs: parseRuns(line) };
  });
}

function runsToHtml(runs: LetterRun[]): string {
  return runs
    .map((r) => {
      let out = escapeHtml(r.text);
      if (r.bold) out = `<strong>${out}</strong>`;
      if (r.italic) out = `<em>${out}</em>`;
      return out;
    })
    .join("");
}

export function letterToHtml(text: string): string {
  const blocks = parseLetter(text);
  let html = "";
  let inList = false;
  for (const block of blocks) {
    if (block.kind === "bullet") {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${runsToHtml(block.runs)}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += block.runs.length === 0 ? "<br>" : `<p style="margin:0">${runsToHtml(block.runs)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

export type Selection = { value: string; start: number; end: number };

// Wraps the selection in a marker (or unwraps it if already wrapped). With
// nothing selected, inserts an empty pair and leaves the cursor between.
export function toggleWrap({ value, start, end }: Selection, marker: string): Selection {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const m = marker.length;

  if (before.endsWith(marker) && after.startsWith(marker)) {
    return { value: before.slice(0, -m) + selected + after.slice(m), start: start - m, end: end - m };
  }
  return { value: before + marker + selected + marker + after, start: start + m, end: end + m };
}

// Toggles a "- " bullet on every line touched by the selection.
export function toggleBullets({ value, start, end }: Selection): Selection {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const allBulleted = lines.every((l) => l.startsWith("- "));
  const updated = lines.map((l) => (allBulleted ? l.slice(2) : l.startsWith("- ") ? l : `- ${l}`));
  const replaced = updated.join("\n");
  return {
    value: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + replaced.length,
  };
}
