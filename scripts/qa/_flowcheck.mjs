// Has any bill ever got all the way through? Read-only.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
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

const { data: bills } = await db.from("bills").select("id, analysis_result, uploaded_at");
const withAnalysis = (bills ?? []).filter((b) => b.analysis_result);
console.log(`bills total: ${bills?.length ?? 0}`);
console.log(`bills with analysis_result: ${withAnalysis.length}   <-- the dev/process-with-ai output`);

const { data: cases } = await db
  .from("cases")
  .select("id, status, errors_detected, savings_found, appeal_letter_text, negotiation_id, letter_sent_at, created_at");
console.log(`\ncases total: ${cases?.length ?? 0}`);
const byStatus = {};
for (const c of cases ?? []) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
console.log(`  by status: ${JSON.stringify(byStatus)}`);
console.log(`  with errors_detected : ${(cases ?? []).filter((c) => c.errors_detected !== null).length}`);
console.log(`  with appeal_letter   : ${(cases ?? []).filter((c) => c.appeal_letter_text).length}`);
console.log(`  with negotiation_id  : ${(cases ?? []).filter((c) => c.negotiation_id).length}`);
console.log(`  with letter_sent_at  : ${(cases ?? []).filter((c) => c.letter_sent_at).length}`);

const { data: ex } = await db.from("bill_extractions").select("bill_id, engine_result, result");
console.log(`\nbill_extractions: ${ex?.length ?? 0}`);
console.log(`  engine_result (vision) : ${(ex ?? []).filter((r) => r.engine_result).length}`);
console.log(`  result (ai-service)    : ${(ex ?? []).filter((r) => r.result).length}`);

const { data: pays } = await db.from("payment_records").select("type, status");
const payAgg = {};
for (const p of pays ?? []) payAgg[`${p.type}/${p.status}`] = (payAgg[`${p.type}/${p.status}`] ?? 0) + 1;
console.log(`\npayment_records: ${JSON.stringify(payAgg)}`);
