// What happened to the most recent upload? Read-only.
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

const { data: bills } = await db
  .from("bills")
  .select("*")
  .order("uploaded_at", { ascending: false })
  .limit(5);

console.log(`=== ${bills?.length ?? 0} most recent bills ===`);
for (const b of bills ?? []) {
  console.log(`\nbill ${b.id}`);
  console.log(`  uploaded_at     ${b.uploaded_at}`);
  console.log(`  status          ${b.status}`);
  console.log(`  filename        ${b.filename}`);
  console.log(`  storage_url     ${b.storage_url}`);
  console.log(`  provider_name   ${JSON.stringify(b.provider_name)}`);
  console.log(`  provider_email  ${JSON.stringify(b.provider_email)}`);
  console.log(`  provider_phone  ${JSON.stringify(b.provider_phone)}`);
  console.log(`  service_date    ${JSON.stringify(b.service_date)}`);
  console.log(`  analysis_result ${b.analysis_result ? "PRESENT" : "null"}`);

  const { data: ex } = await db
    .from("bill_extractions")
    .select("engine_result, result, created_at")
    .eq("bill_id", b.id)
    .maybeSingle();
  if (!ex) {
    console.log(`  bill_extractions  NO ROW  <-- the bill was never read`);
  } else {
    console.log(`  bill_extractions  created ${ex.created_at}`);
    console.log(`     engine_result  ${ex.engine_result ? "PRESENT" : "null"}`);
    console.log(`     result(ai-svc) ${ex.result ? "PRESENT" : "null"}`);
    if (ex.engine_result) {
      const e = ex.engine_result;
      console.log(`     engine: provider=${JSON.stringify(e.provider_name)} due=${e.patient_due} lines=${(e.line_items ?? []).length}`);
    }
  }

  const { data: cases } = await db.from("cases").select("*").eq("bill_id", b.id);
  for (const c of cases ?? []) {
    console.log(`  case ${c.id}`);
    console.log(`     status         ${c.status}`);
    console.log(`     created_at     ${c.created_at}`);
    console.log(`     negotiation_id ${JSON.stringify(c.negotiation_id)}`);
    console.log(`     errors_detected ${c.errors_detected}  savings_found ${c.savings_found}`);
    console.log(`     appeal_letter   ${c.appeal_letter_text ? "PRESENT" : "null"}`);
    console.log(`     letter_sent_at  ${JSON.stringify(c.letter_sent_at)}`);

    const { data: pays } = await db
      .from("payment_records")
      .select("id, type, status, amount, processor_ref, created_at")
      .eq("case_id", c.id);
    console.log(`     payment_records ${pays?.length ?? 0}`);
    for (const p of pays ?? []) {
      console.log(`        ${p.type} ${p.status} $${p.amount} ref=${p.processor_ref} ${p.created_at}`);
    }
  }
  const { data: billPays } = await db
    .from("payment_records")
    .select("id, case_id, type, status, amount, created_at")
    .eq("bill_id", b.id);
  console.log(`  payment_records on the BILL: ${billPays?.length ?? 0}`);
  for (const p of billPays ?? []) {
    console.log(`     ${p.type} ${p.status} $${p.amount} case=${p.case_id} ${p.created_at}`);
  }
}
