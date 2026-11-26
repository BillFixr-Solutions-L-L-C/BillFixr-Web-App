import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const env = Object.fromEntries(readFileSync(`${ROOT}/.env.local`,"utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const ids = ["b7b7dcf9","e3f90fd0","4e8a3e51"];
const { data: cases, error } = await db.from("cases")
  .select("id, user_id, status, negotiation_id, letter_sent_at, updated_at, provider_email")
  .order("created_at", { ascending: false }).limit(30);
if (error) throw error;
const mine = cases.filter(c => ids.some(p => c.id.startsWith(p)));
console.log("=== the three cases ===");
for (const c of mine) {
  console.log(c.id.slice(0,8), "status=", c.status, "neg=", c.negotiation_id ?? "-", "sent=", c.letter_sent_at, "updated=", c.updated_at);
}
console.log("\n=== notifications for their owners ===");
const owners = [...new Set(mine.map(c=>c.user_id))];
const { data: notes } = await db.from("notifications")
  .select("id, user_id, kind, title, created_at, read_at").in("user_id", owners)
  .order("created_at",{ascending:false}).limit(25);
for (const n of notes ?? []) console.log(n.created_at, n.kind, "|", n.title, n.read_at ? "(read)" : "");
