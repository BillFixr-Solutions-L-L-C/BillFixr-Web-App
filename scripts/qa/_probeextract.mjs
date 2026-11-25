// Calls the REAL /api/dashboard/bills/[id]/extract on production, as a
// signed-in owner, and reports status and wall time. This is the call the
// information step makes when it opens.
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { mintLoginToken, readEnvLocal } from "file:///C:/Users/John%20Dansu/OneDrive/Desktop/BillFixr/scripts/qa/login.mjs";

const ROOT = "C:/Users/John Dansu/OneDrive/Desktop/BillFixr";
const BASE = process.argv[2] ?? "https://www.billfixr.com";
const EMAIL = process.argv[3];
const { billId } = JSON.parse(readFileSync(`${ROOT}/scripts/qa/.out/extract-test.json`, "utf8"));

const mod = await import(pathToFileURL(`${ROOT}/scripts/qa/.out/pw/node_modules/playwright/index.js`).href);
const chromium = (mod.default ?? mod).chromium;

const token = await mintLoginToken(EMAIL, readEnvLocal(ROOT));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

try {
  const hash = typeof token === "string" ? token : token.token_hash ?? token.hashed_token;
  await page.goto(`${BASE}/auth/confirm?token_hash=${hash}&type=magiclink&next=/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  const result = await page.evaluate(
    async ([id]) => {
      const started = Date.now();
      try {
        const res = await fetch(`/api/dashboard/bills/${id}/extract`, { method: "POST" });
        const text = await res.text();
        return { status: res.status, seconds: (Date.now() - started) / 1000, body: text.slice(0, 220) };
      } catch (err) {
        return { status: "threw", seconds: (Date.now() - started) / 1000, body: String(err).slice(0, 220) };
      }
    },
    [billId],
  );

  console.log(`extract -> ${result.status} in ${result.seconds.toFixed(1)}s`);
  console.log(result.body);
} catch (err) {
  console.log("FAILED:", String(err).slice(0, 300));
} finally {
  await browser.close();
}
