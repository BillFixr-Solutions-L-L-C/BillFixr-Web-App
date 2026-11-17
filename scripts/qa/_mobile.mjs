// Renders the site at phone width and reports what is actually broken,
// rather than guessing from the CSS.
//
// Covers three audiences, because the public pages are the part least
// likely to be wrong and were for a long time the only part checked:
//   --as public    the marketing pages, no session
//   --as customer  the signed-in dashboard, including a real case
//   --as admin     the admin dashboard
//   --as all       all three (default)
//
// Checks four things a static scan cannot:
//   1. horizontal page scroll -- the clearest "this is broken on mobile"
//   2. elements wider than the viewport, named, so there is something to fix
//   3. tap targets under the 44px accessibility floor
//   4. content hidden behind a desktop-only breakpoint -- a sidebar or
//      table that simply is not reachable on a phone, which is worse
//      than ugly
//
// Read-only. It navigates and looks; it clicks nothing that writes.
//
// Usage:
//   node scripts/qa/_mobile.mjs
//   node scripts/qa/_mobile.mjs --as customer --base http://localhost:3000
//
// The signed-in sweeps need .env.local (service-role key) to mint a
// one-time login token -- see login.mjs. Nothing is emailed.
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
const SHOTS = `${SP}/mobile`;
mkdirSync(SHOTS, { recursive: true });

// Playwright is not a dependency of this project, so it is resolved from
// wherever it is installed rather than added to the app's tree. Point
// PLAYWRIGHT_MODULE at a local install if it is not on the path.
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
  console.error("This script needs Playwright. Either install it locally:");
  console.error("  mkdir -p scripts/qa/.out/pw && cd scripts/qa/.out/pw && npm init -y");
  console.error("  npm i playwright && npx playwright install chromium");
  console.error("or point PLAYWRIGHT_MODULE at an existing install.");
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const BASE = arg("base", process.env.E2E_BASE ?? "https://www.billfixr.com").replace(/\/$/, "");
const WHO = arg("as", "all");

// iPhone 13 / a common Android. 390 is the width most real phones report.
const VIEWPORT = { width: 390, height: 844 };

// Accounts used for the signed-in sweeps. Both are internal accounts; the
// customer one is chosen because it actually carries cases, so the case
// screens render with content instead of an empty state.
const CUSTOMER = process.env.QA_MOBILE_CUSTOMER ?? "adeniransegun18+1@gmail.com";
const ADMIN = process.env.QA_MOBILE_ADMIN ?? "dansujw@gmail.com";

const SWEEPS = {
  public: {
    paths: ["/", "/pricing", "/login", "/signup", "/policies", "/privacy"],
    email: null,
  },
  customer: {
    paths: [
      "/dashboard",
      "/dashboard/documents",
      "/dashboard/case",
      "/dashboard/completed",
      "/dashboard/settings",
      "/dashboard/support",
    ],
    email: CUSTOMER,
  },
  admin: {
    paths: [
      "/admin",
      "/admin/cases",
      "/admin/uploads",
      "/admin/payments",
      "/admin/users",
      "/admin/automation",
      "/admin/support",
      "/admin/settings",
    ],
    email: ADMIN,
  },
};

// What the page looks like at this width, measured rather than assumed.
// Runs in the browser, so it must not close over anything from this file.
function audit(vw) {
  const out = {
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: [],
    smallTaps: [],
    hiddenOnMobile: [],
    visibleNavLinks: 0,
  };

  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    // Something a desktop user can see and a phone user cannot. Only worth
    // reporting when it holds real content and some controls, which rules
    // out the usual decorative duplicates.
    if (
      (style.display === "none" || style.visibility === "hidden") &&
      (el.textContent || "").trim().length > 40 &&
      el.querySelectorAll("a,button,table,form").length > 0
    ) {
      const cls = String(el.className || "");
      if (/(^|\s|:)(md|lg|xl):(block|flex|grid|table|inline)/.test(cls) || /hidden/.test(cls)) {
        out.hiddenOnMobile.push(
          `${el.tagName.toLowerCase()}.${cls.split(" ").slice(0, 3).join(".")} (${el.querySelectorAll("a,button").length} controls)`,
        );
      }
    }

    if (r.width === 0 && r.height === 0) continue;

    // Wider than the viewport AND starting on screen: a genuinely
    // overflowing element rather than something deliberately offscreen.
    if (r.width > vw + 1 && r.left >= -1 && r.left < vw) {
      let scrollable = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "auto" || ov === "scroll" || ov === "hidden") {
          scrollable = true;
          break;
        }
      }
      // Inside a horizontal scroller is fine -- that is the fix, not the bug.
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

    // Can a signed-in person reach the other screens from here at all?
    if (el.tagName === "A" && r.width > 0 && r.height > 0) {
      const href = el.getAttribute("href") || "";
      if (/^\/(dashboard|admin)/.test(href)) out.visibleNavLinks += 1;
    }
  }

  out.overflowing = [...new Set(out.overflowing)].slice(0, 6);
  out.smallTaps = [...new Set(out.smallTaps)].slice(0, 6);
  out.hiddenOnMobile = [...new Set(out.hiddenOnMobile)].slice(0, 4);
  return out;
}

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true });

async function mobileContext(email) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  if (!email) return context;

  // login.mjs mints a one-time magic-link token and /auth/confirm redeems
  // it server-side. Nothing is emailed; no password is needed or stored.
  const { mintLoginToken } = await import(pathToFileURL(`${ROOT}/scripts/qa/login.mjs`).href);
  const tokenHash = await mintLoginToken(email);
  const page = await context.newPage();
  await page.goto(
    `${BASE}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=%2Fdashboard`,
    // domcontentloaded, not networkidle: this hop only has to set the
    // session cookies and land somewhere, and the page it lands on polls,
    // so the network never goes idle and a correct login reads as a timeout.
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  const landed = new URL(page.url());
  await page.close();
  if (landed.pathname.startsWith("/login")) {
    throw new Error(
      `login as ${email} bounced to ${landed.pathname} -- the token may have expired, or ${BASE} points at a different Supabase project`,
    );
  }
  return context;
}

const report = [];
const sweeps = WHO === "all" ? Object.keys(SWEEPS) : [WHO];

for (const who of sweeps) {
  const sweep = SWEEPS[who];
  if (!sweep) {
    console.error(`unknown --as ${who}; expected public, customer, admin or all`);
    process.exit(1);
  }

  let context;
  try {
    context = await mobileContext(sweep.email);
  } catch (err) {
    report.push({ who, path: "(login)", status: `LOGIN FAILED: ${String(err).slice(0, 160)}` });
    continue;
  }

  for (const path of sweep.paths) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));

    let status = "?";
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
      status = res?.status() ?? "no response";
    } catch (err) {
      report.push({ who, path, status: `LOAD FAILED: ${String(err).slice(0, 80)}` });
      await page.close();
      continue;
    }

    // A signed-in path that redirected to /login means the sweep is not
    // measuring what it claims to -- say so rather than reporting a clean
    // page, which is how the public-only audit looked thorough.
    const landedOn = new URL(page.url()).pathname;
    const findings = await page.evaluate(audit, VIEWPORT.width);
    await page.screenshot({
      path: `${SHOTS}/${who}${path.replace(/\//g, "_") || "_root"}.png`,
      fullPage: true,
    });
    report.push({
      who,
      path,
      status,
      landedOn: landedOn === path ? null : landedOn,
      ...findings,
      consoleErrors: [...new Set(consoleErrors)].slice(0, 3),
    });
    await page.close();
  }

  await context.close();
}

await browser.close();

console.log(`viewport ${VIEWPORT.width}x${VIEWPORT.height}, ${BASE}`);
let problems = 0;
let lastWho = null;
for (const r of report) {
  if (r.who !== lastWho) {
    console.log(`\n== ${r.who} ==`);
    lastWho = r.who;
  }
  const scrolls = r.scrollWidth > VIEWPORT.width + 1;
  const navMissing = r.visibleNavLinks === 0 && /dashboard|admin/.test(r.path);
  if (scrolls || navMissing || r.overflowing?.length || r.smallTaps?.length || r.hiddenOnMobile?.length) {
    problems += 1;
  }
  console.log(
    `${r.path}  HTTP ${r.status}` +
      (r.landedOn ? `  -> redirected to ${r.landedOn}` : "") +
      (scrolls ? `  ** PAGE SCROLLS SIDEWAYS: ${r.scrollWidth}px **` : ""),
  );
  if (navMissing) {
    console.log("   ** no visible link to any other screen -- navigation unreachable at this width **");
  }
  if (r.overflowing?.length) {
    console.log("   too wide:");
    for (const o of r.overflowing) console.log(`     ${o}`);
  }
  if (r.hiddenOnMobile?.length) {
    console.log("   content present on desktop but display:none here:");
    for (const h of r.hiddenOnMobile) console.log(`     ${h}`);
  }
  if (r.smallTaps?.length) {
    console.log("   tap targets under 44px high:");
    for (const t of r.smallTaps) console.log(`     ${t}`);
  }
  if (r.consoleErrors?.length) {
    console.log("   console errors:");
    for (const c of r.consoleErrors) console.log(`     ${c}`);
  }
}
console.log(`\n${problems} of ${report.length} pages have something to fix`);
console.log(`screenshots in ${SHOTS}`);
