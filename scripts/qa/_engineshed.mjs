// Measures how often the free-tier engine sheds a request.
//
// Run 2026-11-26: 12 of 14 negotiation reads answered 200, the other two
// hung ~28s and returned 503 with an empty body. That rate is survivable
// for one read and fatal for a sweep of seven, which is why
// /api/cron/negotiation-status retries -- see src/lib/engineRetry.ts.
//
// Re-run this before concluding the engine is "down": a handful of 503s
// mixed with 200s is the normal free-tier behaviour, not an outage. Bursts
// also trip a Cloudflare 429 challenge, so keep the requests spaced.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const base = env.AUTOMATION_ENGINE_BASE_URL, h = { "X-API-Key": env.AUTOMATION_ENGINE_API_KEY };
const neg = "5ad42500-9c07-40ef-a3b0-07c73940d43b";
const t0 = Date.now(); const at = () => `+${((Date.now()-t0)/1000).toFixed(1)}s`;
async function g(p){ try{const r=await fetch(base+p,{headers:h,signal:AbortSignal.timeout(120_000)});return `${r.status}`;}catch(e){return `threw(${e.message})`;} }
// settle first
for (let i=0;i<30;i++){ const s=await g("/api/health"); if(s==="200"){console.log(at(),"settled, health 200");break;} console.log(at(),"waiting, health",s); await new Promise(r=>setTimeout(r,10_000)); }
console.log("--- control: 14 negotiation GETs, no sync-inbox ---");
for (let i=0;i<14;i++){ console.log(at(), `#${i+1} ->`, await g(`/api/negotiations/${neg}`)); await new Promise(r=>setTimeout(r,4_000)); }
