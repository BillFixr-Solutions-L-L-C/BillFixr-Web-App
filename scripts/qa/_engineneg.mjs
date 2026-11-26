import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const env = Object.fromEntries(readFileSync(`${ROOT}/.env.local`,"utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const base = env.AUTOMATION_ENGINE_BASE_URL;
const key = env.AUTOMATION_ENGINE_API_KEY;
console.log("base host:", new URL(base).host, "| api key present:", Boolean(key));
const h = key ? { "X-API-Key": key } : {};
async function probe(path) {
  const t = Date.now();
  try {
    const r = await fetch(base + path, { headers: h, signal: AbortSignal.timeout(90_000) });
    const body = await r.text();
    console.log(path, "->", r.status, `${Date.now()-t}ms`, body.slice(0, 300).replace(/\s+/g," "));
  } catch (e) { console.log(path, "-> threw", `${Date.now()-t}ms`, e.message); }
}
await probe("/api/health");
for (const id of ["5ad42500-9c07-40ef-a3b0-07c73940d43b","4d39f7fb-4dd8-4c59-9bf3-af833cb1c134","e50e1dbd-5466-4478-91b2-015e46e96818"]) {
  await probe(`/api/negotiations/${id}`);
}
