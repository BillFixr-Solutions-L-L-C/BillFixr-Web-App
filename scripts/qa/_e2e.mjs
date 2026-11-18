// A real end-to-end run against production: log in, upload a bill, fill the
// information step, pay the commitment fee, and watch what happens.
//
// Stripe in production is TEST mode (verified: both recorded payment
// intents come back livemode:false under the test key), so 4242 4242 4242
// 4242 is a genuine payment through the real code path and costs nothing.
//
// Two deliberate safety choices:
//  - a SYNTHETIC bill (services/ai-service/samples), so the expected values
//    are known and no real patient's health data is involved.
//  - every email on the bill is a Resend sink, so the dispute letter the
//    engine sends when the negotiation starts cannot reach a real hospital.
import { readFileSync, mkdirSync } from "node:fs";
// Playwright is not a dependency of this project, so it is resolved
// from wherever it is installed rather than added to the app's tree.
// Point PLAYWRIGHT_MODULE at a local install if it is not on the path.
import { fileURLToPath, pathToFileURL } from "node:url";
async function loadChromium() {
  const spec = process.env.PLAYWRIGHT_MODULE ?? "playwright";
  try {
    // A CommonJS package imported dynamically lands on `.default`.
    const mod = await import(spec.includes("/") ? pathToFileURL(spec).href : spec);
    return (mod.default ?? mod).chromium;
  } catch {
    console.error(
      "This script needs Playwright: npm i playwright --no-save && npx playwright install chromium",
    );
    process.exit(1);
  }
}
const chromium = await loadChromium();

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
mkdirSync(SP, { recursive: true });
const SHOTS = `${SP}/e2e`;
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.E2E_BASE ?? "https://www.billfixr.com";
const BILL = `${ROOT}/services/ai-service/samples/sample_scanned_hospital_bill.png`;
const account = JSON.parse(readFileSync(`${SP}/qa-account.json`, "utf8"));

// Resend's sink addresses. Mail to these is accepted and discarded.
const SINK = "delivered@resend.dev";

const log = [];
function step(name, detail = "") {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${name}${detail ? "  " + detail : ""}`;
  console.log(line);
  log.push(line);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on("console", (m) => {
  if (m.type() === "error") step("BROWSER ERROR", m.text().slice(0, 200));
});
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") && !u.includes("/api/payments/status")) {
    step("HTTP", `${r.status()} ${u.replace(BASE, "")}`);
  }
});

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

try {
  // --- log in -------------------------------------------------------------
  step("goto /login");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await shot("01-login");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  step("logged in", page.url());
  await shot("02-dashboard");

  // --- terms --------------------------------------------------------------
  // "Choose a file" opens the terms modal first.
  // Order matters and is not obvious: choosing a file does not upload it.
  // handleFiles() prepares it and moves the stage to `terms`; the upload
  // only happens when "I Agree" is clicked. So the file goes in first, the
  // dialog second.
  // --- upload -------------------------------------------------------------
  step("choosing the file", BILL.split("/").pop());
  await page.setInputFiles('input[type="file"]', BILL);

  const agree = page.getByRole("button", { name: "I Agree" });
  await agree.waitFor({ state: "visible", timeout: 60_000 });
  step("accepting terms, which starts the upload");
  await agree.click();
  // uploading -> uploaded -> information (a 1.2s timer in the page)
  await page.waitForSelector("#info-clientName", { timeout: 180_000 });
  step("reached the information step");
  await shot("03-information");

  // Wait for the engine to finish reading the bill before looking at the
  // boxes. The extract call takes tens of seconds behind a cold start, and
  // reading them immediately captures the empty form rather than the
  // result -- which is the whole thing this run is here to observe.
  await page
    .waitForResponse((r) => r.url().includes("/extract") && r.request().method() === "POST", {
      timeout: 300_000,
    })
    .then(async (r) => step("extract responded", `${r.status()}`))
    .catch(() => step("no extract response seen"));
  // One more beat for React to paint the returned values.
  await page.waitForTimeout(2_000);

  // What the engine filled in by itself, before anything is typed.
  const prefill = {};
  for (const key of [
    "clientName",
    "address",
    "hospitalName",
    "billingManagerEmail",
    "hospitalAddress",
    "supportEmail",
    "billingPhone",
  ]) {
    prefill[key] = await page.inputValue(`#info-${key}`).catch(() => "(missing)");
  }
  step("PREFILLED BY THE ENGINE", JSON.stringify(prefill));

  // --- fill what is still required ---------------------------------------
  const typed = {
    clientName: prefill.clientName || "Jordan Taylor",
    address: prefill.address || "41 Market Street, Burlington, VT 05401",
    clientHospitalNumber: "QA-E2E-001",
    hospitalName: prefill.hospitalName || "North Valley Hospital",
    // Always the sink, whatever the bill said: this is where the dispute
    // letter goes.
    billingManagerEmail: SINK,
    hospitalAddress: prefill.hospitalAddress || "1 Hospital Way, Burlington, VT 05401",
    supportEmail: SINK,
    billingPhone: prefill.billingPhone || "802-555-0100",
  };
  // Every box is read-only until its section is put into edit mode --
  // readOnly={!editing || f.readOnly} -- and there is one Edit button per
  // section (Personal, then Hospital). So: Edit the hospital section,
  // type, then save.
  const edits = page.getByRole("button", { name: "Edit", exact: true });
  const editCount = await edits.count();
  step("edit buttons on the step", String(editCount));
  // The hospital section is the second one.
  await edits.nth(Math.min(1, editCount - 1)).click();

  const hospitalFields = [
    "hospitalName",
    "billingManagerEmail",
    "hospitalAddress",
    "supportEmail",
    "billingPhone",
  ];
  for (const key of hospitalFields) {
    const box = page.locator(`#info-${key}`);
    if (await box.getAttribute("readonly").then((v) => v !== null).catch(() => false)) {
      step("still read-only, skipped", key);
      continue;
    }
    await box.fill(typed[key]);
  }
  step("filled the hospital section", `billing email -> ${SINK}`);
  await shot("04-information-filled");

  // "Save Information" is the control that saves and continues.
  const saveInfo = page.getByRole("button", { name: /Save Information/i });
  await saveInfo.waitFor({ state: "visible", timeout: 30_000 });
  if (await saveInfo.isDisabled()) {
    const body = await page.locator("body").innerText();
    step("Save Information is disabled", body.replace(/\s+/g, " ").slice(0, 400));
  }
  await saveInfo.click();
  await page.getByRole("button", { name: "Scan now" }).waitFor({ timeout: 60_000 });
  step("reached Ready for scan");
  await shot("05-ready");

  // --- pay ----------------------------------------------------------------
  await page.getByRole("button", { name: "Scan now" }).click();
  await page.getByRole("button", { name: "Proceed to Payment" }).click();
  step("opening the payment form");

  // Stripe's Payment Element lives in a cross-origin iframe.
  const card = page.frameLocator('iframe[title*="payment" i], iframe[name^="__privateStripeFrame"]').first();
  await card.locator('[name="number"]').waitFor({ timeout: 90_000 });
  step("payment element ready");
  await card.locator('[name="number"]').fill("4242424242424242");
  await card.locator('[name="expiry"]').fill("12/34");
  await card.locator('[name="cvc"]').fill("123");
  const zip = card.locator('[name="postalCode"]');
  if (await zip.isVisible().catch(() => false)) await zip.fill("05401");
  await shot("06-card-filled");

  await page.getByRole("button", { name: /Confirm Payment/i }).click();
  step("submitted the payment (test card 4242)");

  // --- scanning -----------------------------------------------------------
  // The page polls the payment, then runs the analysis. Generous: a vision
  // call behind a free-tier cold start.
  const scanning = page.getByText(/Analyzing your bill/i);
  await scanning.waitFor({ timeout: 180_000 }).catch(() => step("did not see the analyzing state"));
  step("scanning stage reached");
  await shot("07-scanning");

  // Either the scan finishes, or it shows an error. Wait for whichever.
  //
  // It used to wait for "Negotiating". Until 2026-11-18 the scan started
  // the negotiation in the same request that wrote the analysis, so the
  // letter was already with the provider by the time this screen
  // appeared. It now stops at "Analyzed" and nothing has been sent.
  const outcome = await Promise.race([
    page
      .getByText(/Analyzed/i)
      .first()
      .waitFor({ timeout: 300_000 })
      .then(() => "analyzed"),
    page
      .getByText(/couldn't analyze|Please try again/i)
      .first()
      .waitFor({ timeout: 300_000 })
      .then(() => "error"),
  ]).catch(() => "timeout");
  step("OUTCOME", outcome);
  await shot("08-outcome");

  const visible = await page.locator("body").innerText();
  step("screen text", visible.replace(/\s+/g, " ").slice(0, 600));

  // --- the decision point -------------------------------------------------
  // The part Segun reported missing on 2026-11-18: Re-scan should be on
  // the analysis, and nothing should have reached the provider yet.
  if (outcome === "analyzed") {
    await page.getByRole("link", { name: /Review your analysis/i }).click();
    await page.waitForURL(/\/dashboard\/documents\//, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shot("09-analysis");

    const rescan = await page.getByRole("button", { name: /^Re-scan$/ }).count();
    const proceed = await page.getByRole("button", { name: /^Proceed$/ }).count();
    step("DECISION POINT", `re-scan=${rescan} proceed=${proceed}`);
    if (!rescan || !proceed) step("MISSING", "the decision point did not render both buttons");
  }
} catch (err) {
  step("FAILED", String(err).slice(0, 400));
  await shot("99-failure");
} finally {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${SP}/e2e-log.txt`, log.join("\n"), "utf8");
  console.log(`\nscreenshots in ${SHOTS}`);
  await browser.close();
}
