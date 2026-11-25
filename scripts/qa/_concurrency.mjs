// Does one read make the engine refuse everything else?
//
// Starts a single /api/extract and polls /api/health beside it every 3s.
// If health turns 503 only while the read is in flight, the instance is
// shedding under concurrency. If health stays 200 throughout, the 503s
// seen elsewhere are not caused by a read being in progress.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const ROOT = "C:/Users/John Dansu/OneDrive/Desktop/BillFixr";
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const base = env.AUTOMATION_ENGINE_BASE_URL.replace(/\/$/, "");
const H = { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY };
const bytes = readFileSync(`${ROOT}/services/ai-service/samples/sample_scanned_hospital_bill.png`);

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);

// Unique bytes per run, or the engine serves its own cached reading and
// no vision call happens -- a 5s "read" that tests nothing. Random bytes
// appended AFTER the PNG's end-of-image chunk: decoders stop at IEND, so
// the picture is identical and only the content hash changes.
const unique = Buffer.concat([bytes, randomBytes(64)]);
const body = new FormData();
body.append("files", new Blob([unique], { type: "image/png" }), "concurrency.png");

let reading = true;
const read = fetch(`${base}/api/extract`, { method: "POST", headers: H, body })
  .then((r) => { reading = false; console.log(`${at()}s  READ  -> ${r.status}`); })
  .catch((e) => { reading = false; console.log(`${at()}s  READ  -> threw ${e.message}`); });

while (reading) {
  const s = Date.now();
  const res = await fetch(`${base}/api/health`, { headers: H }).catch(() => null);
  console.log(`${at()}s  health-> ${res ? res.status : "threw"} (${((Date.now() - s) / 1000).toFixed(1)}s)${reading ? "" : "  [read already done]"}`);
  await new Promise((r) => setTimeout(r, 3000));
}
await read;
