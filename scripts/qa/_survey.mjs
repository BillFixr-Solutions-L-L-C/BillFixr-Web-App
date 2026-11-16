// What is actually in production, and which of it carries anything worth
// keeping. Read-only. Nothing here deletes.
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

const [{ data: bills }, { data: cases }, { data: pays }, { data: ex }, { data: profiles }] = await Promise.all([
  db.from("bills").select("*"),
  db.from("cases").select("*"),
  db.from("payment_records").select("*"),
  db.from("bill_extractions").select("bill_id"),
  db.from("profiles").select("id, email, name, role, created_at"),
]);

const caseByBill = new Map((cases ?? []).map((c) => [c.bill_id, c]));
const paysByBill = new Map();
for (const p of pays ?? []) {
  if (!paysByBill.has(p.bill_id)) paysByBill.set(p.bill_id, []);
  paysByBill.get(p.bill_id).push(p);
}
const extractionBills = new Set((ex ?? []).map((r) => r.bill_id));
const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

/** Anything that means a row is NOT disposable. */
function keepReasons(bill) {
  const r = [];
  const c = caseByBill.get(bill.id);
  const ps = paysByBill.get(bill.id) ?? [];
  if (ps.some((p) => p.status === "paid")) r.push("A PAID payment");
  if (bill.analysis_result) r.push("analysis_result");
  if (c?.negotiation_id) r.push("negotiation_id");
  if (c?.letter_sent_at) r.push("letter_sent_at");
  if (c?.appeal_letter_text) r.push("appeal_letter_text");
  if (c?.errors_detected != null) r.push("errors_detected");
  if (c?.savings_found) r.push("savings_found");
  return r;
}

const disposable = [];
const keep = [];
for (const bill of bills ?? []) {
  const reasons = keepReasons(bill);
  (reasons.length ? keep : disposable).push({ bill, reasons });
}

const who = (id) => byId.get(id)?.email ?? "(unknown account)";

console.log(`BILLS: ${bills.length} total — ${disposable.length} disposable, ${keep.length} to keep\n`);
console.log("--- KEEP (something real happened) ---");
for (const { bill, reasons } of keep) {
  const c = caseByBill.get(bill.id);
  console.log(`  ${bill.id.slice(0, 8)} ${String(bill.uploaded_at).slice(0, 10)} ${who(bill.user_id).padEnd(28)} case=${c ? c.status : "none"}`);
  console.log(`      keep because: ${reasons.join(", ")}`);
}

console.log(`\n--- DISPOSABLE (no payment, no analysis, no negotiation, no letter) ---`);
const perUser = {};
for (const { bill } of disposable) {
  const e = who(bill.user_id);
  perUser[e] = (perUser[e] ?? 0) + 1;
}
for (const [email, n] of Object.entries(perUser)) console.log(`  ${String(n).padStart(3)}  ${email}`);

const disposableIds = disposable.map((d) => d.bill.id);
const casesToGo = (cases ?? []).filter((c) => disposableIds.includes(c.bill_id));
const orphanCases = (cases ?? []).filter((c) => !bills.some((b) => b.id === c.bill_id));
const paysToGo = (pays ?? []).filter((p) => disposableIds.includes(p.bill_id));
const exToGo = [...extractionBills].filter((id) => disposableIds.includes(id));
const orphanEx = [...extractionBills].filter((id) => !bills.some((b) => b.id === id));

console.log(`\nwould also remove:`);
console.log(`  cases            ${casesToGo.length}   (statuses: ${JSON.stringify(casesToGo.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {}))})`);
console.log(`  payment_records  ${paysToGo.length}   (statuses: ${JSON.stringify(paysToGo.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] ?? 0) + 1 }), {}))})`);
console.log(`  bill_extractions ${exToGo.length}`);
console.log(`  orphan cases (bill already gone)      ${orphanCases.length}`);
console.log(`  orphan extractions (bill already gone) ${orphanEx.length}`);

const paidNotOnDisposable = (pays ?? []).filter((p) => p.status === "paid" && !disposableIds.includes(p.bill_id));
console.log(`\nPAID payments that would be untouched: ${paidNotOnDisposable.length}`);

writeFileSync(
  `${SP}/survey.json`,
  JSON.stringify({ disposableIds, keep: keep.map((k) => ({ id: k.bill.id, reasons: k.reasons })), orphanCases, orphanEx }, null, 2),
  "utf8",
);
console.log(`\nplan written to ${SP}/survey.json`);
