// Is the ai-service (which the analysis step calls) reachable from
// production right now? Read-only. Logs in as an admin via the password-free
// helper and reads /api/ai/health, which is admin-gated.
import { mintLoginToken } from "./login.mjs";

const BASE = process.argv[2] ?? "https://www.billfixr.com";
// No default: this mints a login for whoever it names, so the account
// has to be chosen deliberately rather than baked into a committed file.
const EMAIL = process.argv[3] ?? process.env.QA_ADMIN_EMAIL;
if (!EMAIL) {
  console.error("Usage: node scripts/qa/_aihealth.mjs [baseUrl] <adminEmail>   (or set QA_ADMIN_EMAIL)");
  process.exit(1);
}

const tokenHash = await mintLoginToken(EMAIL);
const confirm = `${BASE}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=/dashboard`;

// Follow the redeem by hand so the Set-Cookie headers can be reused.
const res = await fetch(confirm, { redirect: "manual" });
const cookies = (res.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(";")[0])
  .join("; ");
console.log(`redeem -> ${res.status}, ${cookies ? "session cookies received" : "NO cookies"}`);
if (!cookies) process.exit(1);

for (const path of ["/api/ai/health"]) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookies } });
  const text = await r.text();
  console.log(`\nGET ${path} -> ${r.status}`);
  console.log(text.slice(0, 1200));
}
