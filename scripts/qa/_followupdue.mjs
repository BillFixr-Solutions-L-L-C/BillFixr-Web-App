import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data: cases, error } = await db.from("cases")
  .select("id, status, negotiation_id").not("negotiation_id","is",null)
  .in("status",["uploaded","scanning","analyzed","letter_sent","awaiting_response"]);
if (error) throw error;
console.log("still in the sweep's net:", cases.length);
const h = { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY };
for (const c of cases) {
  const r = await fetch(env.AUTOMATION_ENGINE_BASE_URL + `/api/negotiations/${c.negotiation_id}`, { headers: h, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) { console.log(c.id.slice(0,8), c.status, "-> engine", r.status); await new Promise(x=>setTimeout(x,4000)); continue; }
  const n = await r.json();
  const outbound = (n.messages ?? []).filter(m => m.direction === "OUTBOUND");
  const last = outbound.at(-1);
  const hours = last ? ((Date.now() - Date.parse(last.created_at)) / 3_600_000).toFixed(0) : "n/a";
  console.log(c.id.slice(0,8), c.status, "| neg:", n.status, "| cadence_step:", n.cadence_step, "| last outbound:", hours, "h ago");
  await new Promise(x=>setTimeout(x,4000));
}
