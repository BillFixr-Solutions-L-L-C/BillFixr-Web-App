// Removes the throwaway end-to-end account and everything it created.
//
// Scoped to that one account by id -- it never touches a row belonging to
// anyone else -- and it records every row to a file before deleting, so a
// mistake is recoverable from the record. Read-only without --apply.
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
mkdirSync(SP, { recursive: true });

const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { userId, email } = JSON.parse(readFileSync(`${SP}/qa-account.json`, "utf8"));
console.log(`target: ${email}  ${userId}`);

// Guard: refuse to run against anything that is not the QA sink address.
if (!email.endsWith("@resend.dev")) {
  console.error("refusing: the target is not a resend.dev sink address");
  process.exit(1);
}

const { data: bills } = await db.from("bills").select("*").eq("user_id", userId);
const billIds = (bills ?? []).map((b) => b.id);
const { data: cases } = await db.from("cases").select("*").eq("user_id", userId);
const caseIds = (cases ?? []).map((c) => c.id);
const { data: pays } = await db.from("payment_records").select("*").in("bill_id", billIds.length ? billIds : ["none"]);
const { data: extractions } = await db
  .from("bill_extractions")
  .select("bill_id")
  .in("bill_id", billIds.length ? billIds : ["none"]);

console.log(`  bills            ${billIds.length}`);
console.log(`  cases            ${caseIds.length}  (negotiations: ${(cases ?? []).filter((c) => c.negotiation_id).length})`);
console.log(`  payment_records  ${(pays ?? []).length}`);
console.log(`  bill_extractions ${(extractions ?? []).length}`);
for (const c of cases ?? []) {
  console.log(`    case ${String(c.id).slice(0, 8)} status=${c.status} negotiation=${c.negotiation_id ?? "none"}`);
}

writeFileSync(
  `${SP}/qa-deleted-record.json`,
  JSON.stringify({ userId, email, bills, cases, pays, extractions }, null, 2),
  "utf8",
);
console.log(`\nrecorded everything to ${SP}/qa-deleted-record.json`);

if (!process.argv.includes("--apply")) {
  console.log("DRY RUN -- nothing deleted. Re-run with --apply.");
  process.exit(0);
}

// Children first: payment_records and bill_extractions reference bills,
// cases reference bills. Storage objects go before the rows that name them.
for (const bill of bills ?? []) {
  if (!bill.storage_url) continue;
  const { error } = await db.storage.from("bills").remove([bill.storage_url]);
  console.log(`storage ${bill.storage_url.slice(0, 40)}… ${error ? "FAILED: " + error.message : "removed"}`);
}

const steps = [
  ["payment_records", () => db.from("payment_records").delete({ count: "exact" }).in("bill_id", billIds)],
  ["bill_extractions", () => db.from("bill_extractions").delete({ count: "exact" }).in("bill_id", billIds)],
  ["cases", () => db.from("cases").delete({ count: "exact" }).eq("user_id", userId)],
  ["bills", () => db.from("bills").delete({ count: "exact" }).eq("user_id", userId)],
];
for (const [name, run] of steps) {
  if (billIds.length === 0 && name !== "cases") continue;
  const { error, count } = await run();
  console.log(`${name}: ${error ? "FAILED: " + error.message : `deleted ${count}`}`);
}

const { error: userError } = await db.auth.admin.deleteUser(userId);
console.log(`auth user: ${userError ? "FAILED: " + userError.message : "deleted"}`);

const { data: left } = await db.from("bills").select("id").eq("user_id", userId);
console.log(`\nbills remaining for that user: ${(left ?? []).length}`);
