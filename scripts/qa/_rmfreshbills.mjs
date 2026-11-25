// Deletes only the bills this session's wake-check probes created: scoped
// to the QA account's own user id AND the filename those probes used, so
// it cannot reach a customer's document even if the account id were wrong.
import { readFileSync } from "node:fs";
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
const { data: mine, error } = await db.from("bills")
  .select("id, storage_url, filename, user_id")
  .eq("user_id", userId)
  .eq("filename", "wake-check.png");
if (error) { console.log("read failed:", error.message); process.exit(1); }

for (const b of mine ?? []) {
  if (b.user_id !== userId || b.filename !== "wake-check.png") {
    console.log(`refusing ${b.id}: does not match the guard`);
    continue;
  }
  await db.from("bill_extractions").delete().eq("bill_id", b.id);
  await db.from("bills").delete().eq("id", b.id);
  if (b.storage_url) await db.storage.from("bills").remove([b.storage_url]);
  console.log(`removed probe bill ${b.id.slice(0, 8)}`);
}
console.log(`${(mine ?? []).length} probe bill(s) removed`);
