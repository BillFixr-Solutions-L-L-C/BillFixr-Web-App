import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const r = await fetch("https://api.resend.com/emails?limit=20", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
const j = await r.json();
console.log("http", r.status);
for (const e of (j.data ?? [])) console.log(e.created_at, e.last_event ?? "?", "|", (e.subject??"").slice(0,48));
if (!j.data) console.log(JSON.stringify(j).slice(0,300));
