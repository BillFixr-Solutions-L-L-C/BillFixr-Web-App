// Fires several reads at once and polls health beside them, to see
// whether concurrent reads are what makes the engine shed requests with
// a 503. Each upload is byte-unique so every one is a real vision call.
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

const N = Number(process.argv[2] ?? 3);
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);

let open = N;
const reads = Array.from({ length: N }, (_, i) => {
  const body = new FormData();
  body.append("files", new Blob([Buffer.concat([bytes, randomBytes(64)])], { type: "image/png" }), `c${i}.png`);
  return fetch(`${base}/api/extract`, { method: "POST", headers: H, body })
    .then((r) => { open--; console.log(`${at()}s  read ${i} -> ${r.status}`); })
    .catch((e) => { open--; console.log(`${at()}s  read ${i} -> threw ${e.message.slice(0, 60)}`); });
});

while (open > 0) {
  const s = Date.now();
  const res = await fetch(`${base}/api/health`, { headers: H }).catch(() => null);
  console.log(`${at()}s  health -> ${res ? res.status : "threw"} (${((Date.now() - s) / 1000).toFixed(1)}s)  reads open=${open}`);
  await new Promise((r) => setTimeout(r, 3000));
}
await Promise.all(reads);
