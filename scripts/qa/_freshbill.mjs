// Uploads the SYNTHETIC sample bill as a brand-new bill owned by the QA
// customer, so the extract route finds no cached reading and has to go
// through the wake path -- the thing under test. Never a real patient's bill.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = "C:/Users/John Dansu/OneDrive/Desktop/BillFixr";
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { userId } = JSON.parse(readFileSync(`${ROOT}/scripts/qa/.out/qa-account.json`, "utf8"));
const SAMPLE = `${ROOT}/services/ai-service/samples/sample_scanned_hospital_bill.png`;
const bytes = readFileSync(SAMPLE);
const path = `${userId}/${Date.now()}-wake-check.png`;

const up = await db.storage.from("bills").upload(path, bytes, { contentType: "image/png" });
if (up.error) { console.log("upload failed:", up.error.message); process.exit(1); }

const { data: bill, error } = await db.from("bills")
  .insert({ user_id: userId, filename: "wake-check.png", storage_url: path, status: "uploaded" })
  .select("id").single();
if (error) { console.log("insert failed:", error.message); process.exit(1); }

writeFileSync(`${ROOT}/scripts/qa/.out/extract-test.json`, JSON.stringify({ billId: bill.id }));
console.log(`fresh bill ${bill.id} for user ${userId.slice(0, 8)} (no cached extraction)`);
