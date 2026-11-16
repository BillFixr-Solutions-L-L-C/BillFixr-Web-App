import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const env = Object.fromEntries(readFileSync(`${ROOT}/.env.local`,"utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data, error } = await db.from("profiles").select("id, role, status").eq("role","admin");
if (error) console.log("profiles error:", error.message);
console.log(`admins: ${data?.length ?? 0}`, (data??[]).map(a=>a.status).join(","));
const { data: acc, error: e2 } = await db.from("admin_domain_access").select("*").limit(20);
if (e2) console.log("admin_domain_access:", e2.message);
else { console.log(`domain access rows: ${acc.length}`); for (const r of acc) console.log("  ", JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=="user_id"&&k!=="id")))); }
