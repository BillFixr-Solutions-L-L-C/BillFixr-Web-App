// Read-only: did the engine see the provider's reply, and does the case reflect it?
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

const { data: cases } = await db
  .from("cases")
  .select("id, status, negotiation_id, letter_sent_at, created_at, provider_email, rescan_count, rescanned_at")
  .order("created_at", { ascending: false })
  .limit(12);
for (const c of cases ?? []) {
  console.log(`case ${c.id.slice(0, 8)} status=${c.status} neg=${c.negotiation_id ? c.negotiation_id.slice(0,8) : "-"} sent=${c.letter_sent_at ?? "-"} rescans=${c.rescan_count} created=${c.created_at}`);
}

const { data: docs } = await db.from("case_documents").select("case_id, type, created_at");
console.log(`\ncase_documents: ${docs?.length ?? 0}`);
for (const d of docs ?? []) console.log(`  ${d.case_id.slice(0,8)} ${d.type} ${d.created_at}`);

const base = env.AUTOMATION_ENGINE_BASE_URL?.replace(/\/$/, "");
console.log(`\nengine base host: ${base ? new URL(base).host : "(unset)"}`);
for (const c of (cases ?? []).filter((c) => c.negotiation_id)) {
  try {
    const res = await fetch(`${base}/api/negotiations/${c.negotiation_id}`, {
      headers: { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY ?? "" },
    });
    if (!res.ok) {
      console.log(`  neg ${c.negotiation_id.slice(0,8)} -> HTTP ${res.status}`);
      continue;
    }
    const n = await res.json();
    const dirs = {};
    for (const m of n.messages ?? []) dirs[m.direction] = (dirs[m.direction] ?? 0) + 1;
    console.log(`  neg ${c.negotiation_id.slice(0,8)} engine_status=${n.status} cadence=${n.cadence_step} msgs=${JSON.stringify(dirs)} settled=${n.settled_amount} updated=${n.updated_at}`);
    for (const m of (n.messages ?? [])) {
      console.log(`     ${m.direction} ${m.created_at} subj="${String(m.subject ?? "").slice(0,60)}" len=${String(m.content_markdown ?? "").length} status=${m.status}`);
    }
  } catch (e) {
    console.log(`  neg ${c.negotiation_id.slice(0,8)} -> ${e.message}`);
  }
}
