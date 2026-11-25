// Posts the synthetic sample bill straight at the engine's /api/extract,
// bypassing the web app, to see the engine's own status and body.
import { readFileSync } from "node:fs";
const ROOT = "C:/Users/John Dansu/OneDrive/Desktop/BillFixr";
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const base = env.AUTOMATION_ENGINE_BASE_URL.replace(/\/$/, "");
const bytes = readFileSync(`${ROOT}/services/ai-service/samples/sample_scanned_hospital_bill.png`);

const body = new FormData();
body.append("files", new Blob([bytes], { type: "image/png" }), "wake-check.png");

const t0 = Date.now();
const res = await fetch(`${base}/api/extract`, {
  method: "POST",
  headers: { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY },
  body,
});
const text = await res.text();
console.log(`engine /api/extract -> ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(text.slice(0, 1200));
