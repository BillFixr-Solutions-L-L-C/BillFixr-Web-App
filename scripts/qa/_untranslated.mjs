// What customer-facing English is still hardcoded?
//
// The type checker proves every key exists; it cannot prove a component
// reads the dictionary at all. This looks for the opposite: visible
// English text still written as a literal in a customer-facing component.
//
// Deliberately noisy rather than clever. It over-reports -- a `title`
// attribute, a sort label, an aria-label -- because a scanner that misses
// a real string is worse than one that asks about a few it should not.
// Read-only.
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../src", import.meta.url));

// Admin screens are staff-facing and stay English by design.
const SKIP = [
  `${path.sep}admin${path.sep}`,
  ".test.",
  `${path.sep}api${path.sep}`, // server routes: their copy lives in emailCopy
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(full)) out.push(full);
  }
  return out;
}

// JSX text between tags, and the attributes a customer reads.
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}]{3,100}?)\s*</g;
const ATTRS = /\b(placeholder|title|aria-label|alt)="([A-Z][^"]{3,100})"/g;

// Things that look like prose but are not shown, or are proper nouns.
const IGNORE = [
  /^BillFixr$/i,
  /^BILLFIXR$/,
  /^Bill$|^Fixr$/,
  /^[A-Z][a-z]+\.(tsx|ts|png|jpg|pdf)$/,
  /^https?:/,
  /^[A-Z_]+$/, // SCREAMING_CASE identifiers
];

const files = walk(ROOT).filter((f) => !SKIP.some((s) => f.includes(s)));
let total = 0;
const findings = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const hits = new Set();

  for (const [, text] of src.matchAll(JSX_TEXT)) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.includes("&&") || clean.includes("?") === false && clean.length < 4) continue;
    if (IGNORE.some((re) => re.test(clean))) continue;
    hits.add(clean);
  }
  for (const [, , text] of src.matchAll(ATTRS)) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (IGNORE.some((re) => re.test(clean))) continue;
    hits.add(`[attr] ${clean}`);
  }

  if (hits.size) {
    findings.push({ file: path.relative(ROOT, file), hits: [...hits] });
    total += hits.size;
  }
}

findings.sort((a, b) => b.hits.length - a.hits.length);
console.log(`${files.length} customer-facing .tsx files scanned`);
console.log(`${total} possible untranslated strings in ${findings.length} files\n`);
for (const f of findings) {
  console.log(`${String(f.hits.length).padStart(3)}  ${f.file}`);
  for (const h of f.hits.slice(0, 6)) console.log(`       ${h.slice(0, 92)}`);
  if (f.hits.length > 6) console.log(`       … ${f.hits.length - 6} more`);
}
