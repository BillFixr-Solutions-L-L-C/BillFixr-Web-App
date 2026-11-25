// Mimics exactly what CaseInformationStep does when the step opens:
// POST the extract route, and on a retryable stage come back after 5s,
// up to 3 attempts. A single-shot probe understates the fix, because the
// real client retries; this reports what a customer actually sees.
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
      const RETRYABLE = new Set(["engine_waking", "engine_busy"]);
      const started = Date.now();
      const tried = [];
      let body = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/dashboard/bills/${id}/extract`, { method: "POST" }).catch(() => null);
        body = await res?.json().catch(() => null);
        tried.push(`${res?.status}${body?.stage ? "/" + body.stage : ""}`);
        if (res?.ok && body?.fields) break;
        if (!RETRYABLE.has(body?.stage ?? "")) break;
        await new Promise((r) => setTimeout(r, 5_000));
        body = null;
      }
      return {
        filled: Boolean(body?.fields?.hospitalName),
        hospitalName: body?.fields?.hospitalName ?? null,
        attempts: tried,
        seconds: (Date.now() - started) / 1000,
      };
    },
    [billId],
  );

  console.log(
    `${result.filled ? "FILLED" : "BLANK "} in ${result.seconds.toFixed(1)}s  attempts=[${result.attempts.join(", ")}]  name=${result.hospitalName ?? "-"}`,
  );
} catch (err) {
  console.log("FAILED:", String(err).slice(0, 200));
} finally {
  await browser.close();
}
