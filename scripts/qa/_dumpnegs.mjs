import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const h = { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY };
// usage: node scripts/qa/_dumpnegs.mjs <out.json> <negotiation-id>...
const out = {};
const ids = process.argv.slice(3);
for (const id of ids) {
  const r = await fetch(env.AUTOMATION_ENGINE_BASE_URL + `/api/negotiations/${id}`, { headers: h, signal: AbortSignal.timeout(60_000) });
  out[id] = r.ok ? await r.json() : { __http: r.status };
  await new Promise(x=>setTimeout(x,4000));
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
console.log("wrote", Object.keys(out).length, "negotiations");
