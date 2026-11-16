// Read-only: the held case's negotiation in full, for the reply-display work.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: c } = await db.from("cases").select("id, negotiation_id, status").eq("status", "response_received").not("negotiation_id", "is", null).single();
const base = env.AUTOMATION_ENGINE_BASE_URL.replace(/\/$/, "");
const res = await fetch(`${base}/api/negotiations/${c.negotiation_id}`, { headers: { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY } });
const n = await res.json();
const { messages, ...rest } = n;
console.log(JSON.stringify(rest, null, 1));
for (const m of messages) {
  console.log(`\n--- ${m.direction} ${m.created_at} status=${m.status}`);
  console.log(`subject: ${m.subject}`);
  console.log(`analysis: ${JSON.stringify(m.analysis)}`);
  if (m.direction !== "OUTBOUND") console.log(m.content_markdown);
}
