// Screenshots the four legal pages in both languages, so the Spanish can
// be looked at rather than assumed.
//
// The dictionary tests prove the right strings exist and reach the DOM.
// They cannot show a heading that now wraps onto three lines, a jump nav
// that overflows because the Spanish labels are longer, or the
// courtesy-translation notice sitting in the wrong place. Those only
// show up in a picture.
//
// Read-only: it sets the display-language cookie and navigates.
//
// Usage:
//   node scripts/qa/_legalshots.mjs
//   node scripts/qa/_legalshots.mjs --base http://localhost:3000 --width 390
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
const SHOTS = `${SP}/legal`;
mkdirSync(SHOTS, { recursive: true });

async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    `${SP}/pw/node_modules/playwright/index.js`,
    "playwright",
  ].filter(Boolean);
  for (const spec of candidates) {
    try {
      const mod = await import(spec.includes("/") ? pathToFileURL(spec).href : spec);
      const chromium = (mod.default ?? mod).chromium;
      if (chromium) return chromium;
    } catch {
      /* try the next candidate */
    }
  }
  console.error("This script needs Playwright -- see scripts/qa/_mobile.mjs for how to install it.");
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const WIDTH = Number(arg("width", "1280"));
const PAGES = ["/terms", "/privacy", "/compliance", "/policies"];

const chromium = await loadChromium();
const browser = await chromium.launch();

for (const language of ["en", "es"]) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  // The same cookie getDisplayLanguage() reads on the server.
  await context.addCookies([
    { name: "bf_lang_display", value: language, url: BASE },
  ]);
  const page = await context.newPage();

  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const name = `${path.slice(1)}-${language}-${WIDTH}.png`;
    await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });

    // Whatever is on screen, in order, so a wrong language is obvious
    // from the log without opening the image.
    const heading = await page.locator("h1").first().innerText();
    const updated = await page.locator("h1 + p").first().innerText();
    console.log(`${name}\n  h1: ${heading}\n  ${updated}`);
  }

  await context.close();
}

await browser.close();
console.log(`\nShots in ${SHOTS}`);
