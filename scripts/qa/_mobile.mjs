// Renders the public pages at phone width and reports what is actually
// broken, rather than guessing from the CSS.
//
// Checks three things a static scan cannot:
//   1. horizontal page scroll -- the clearest "this is broken on mobile"
//   2. elements wider than the viewport, named, so there is something to fix
//   3. tap targets under 44px, which is the accessibility floor
//
// Read-only: it only looks.
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SP = `${ROOT}/scripts/qa/.out`;
mkdirSync(SP, { recursive: true });
const pw = await import(
  pathToFileURL(`${SP}/pw/node_modules/playwright/index.js`).href
);
const { chromium } = pw.default ?? pw;

const BASE = process.env.E2E_BASE ?? "https://www.billfixr.com";
const SHOTS = `${SP}/mobile`;
mkdirSync(SHOTS, { recursive: true });

// iPhone 13 / a common Android. 390 is the width most real phones report.
const VIEWPORT = { width: 390, height: 844 };
const PAGES = ["/", "/pricing", "/login", "/signup", "/policies", "/privacy"];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const report = [];

for (const path of PAGES) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));

  let status = "?";
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
    status = res?.status() ?? "no response";
  } catch (err) {
    report.push({ path, status: `LOAD FAILED: ${String(err).slice(0, 80)}` });
    await page.close();
    continue;
  }

  const findings = await page.evaluate((vw) => {
    const out = { scrollWidth: document.documentElement.scrollWidth, overflowing: [], smallTaps: [] };
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Wider than the viewport AND starting on screen: a genuinely
      // overflowing element rather than something deliberately offscreen.
      if (r.width > vw + 1 && r.left >= -1 && r.left < vw) {
        const style = getComputedStyle(el);
        // Inside a horizontal scroller is fine -- that is the fix, not the bug.
        let scrollable = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === "auto" || ov === "scroll" || ov === "hidden") {
            scrollable = true;
            break;
          }
        }
        if (!scrollable && style.position !== "fixed") {
          out.overflowing.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").slice(0, 2).join(".") : ""} = ${Math.round(r.width)}px`,
          );
        }
      }
      if (["BUTTON", "A"].includes(el.tagName) && r.width > 0 && (r.height < 44 || r.width < 24)) {
        const label = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28);
        if (label) out.smallTaps.push(`${label} (${Math.round(r.width)}x${Math.round(r.height)})`);
      }
    }
    out.overflowing = [...new Set(out.overflowing)].slice(0, 6);
    out.smallTaps = [...new Set(out.smallTaps)].slice(0, 6);
    return out;
  }, VIEWPORT.width);

  await page.screenshot({ path: `${SHOTS}/${path.replace(/\//g, "_") || "_root"}.png`, fullPage: true });
  report.push({ path, status, ...findings, consoleErrors: [...new Set(consoleErrors)].slice(0, 3) });
  await page.close();
}

await browser.close();

console.log(`viewport ${VIEWPORT.width}x${VIEWPORT.height}, ${BASE}\n`);
for (const r of report) {
  const scrolls = r.scrollWidth > VIEWPORT.width + 1;
  console.log(`${r.path}  HTTP ${r.status}${scrolls ? `  ** PAGE SCROLLS SIDEWAYS: ${r.scrollWidth}px **` : ""}`);
  if (r.overflowing?.length) {
    console.log(`   too wide:`);
    for (const o of r.overflowing) console.log(`     ${o}`);
  }
  if (r.smallTaps?.length) {
    console.log(`   tap targets under 44px high:`);
    for (const t of r.smallTaps) console.log(`     ${t}`);
  }
  if (r.consoleErrors?.length) {
    console.log(`   console errors:`);
    for (const c of r.consoleErrors) console.log(`     ${c}`);
  }
}
console.log(`\nscreenshots in ${SHOTS}`);
