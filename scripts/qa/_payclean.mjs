// Removes payment_records that Stripe confirms never took any money.
//
// Driven by the reconciliation in _payaudit.mjs, not by our own `status`
// column: a row is only removed when Stripe itself says the intent never
// succeeded. Deleting on `status != 'paid'` alone would be trusting the
// very field the audit existed to check.
//
// Records everything first. Read-only without --apply.
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
mkdirSync(SP, { recursive: true });
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

const { data: pays } = await db.from("payment_records").select("*");
const removable = [];
const kept = [];

for (const p of pays ?? []) {
  if (!p.processor_ref || !/^pi_/.test(p.processor_ref)) {
    // No intent to check against. Left alone rather than guessed at.
    kept.push({ p, why: "no stripe reference to verify against" });
    continue;
  }
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${p.processor_ref}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) {
    kept.push({ p, why: `stripe lookup failed (${res.status})` });
    continue;
  }
  if (body.status === "succeeded" || body.amount_received > 0) {
    kept.push({ p, why: `stripe says ${body.status}, amount_received=${body.amount_received}` });
    continue;
  }
  if (p.status === "paid") {
    // Our row claims paid while Stripe disagrees. That is a discrepancy to
    // look at, never something to quietly delete.
    kept.push({ p, why: `WE say paid but stripe says ${body.status} -- needs a look` });
    continue;
  }
  removable.push({ p, stripeStatus: body.status });
}

console.log(`${pays.length} payment_records: ${removable.length} removable, ${kept.length} kept\n`);
console.log("--- KEPT ---");
for (const k of kept) {
  console.log(`  ${String(k.p.created_at).slice(0, 19)}  ${k.p.status.padEnd(8)} $${k.p.amount}  ${k.why}`);
}
console.log("\n--- REMOVABLE (stripe confirms no money ever moved) ---");
for (const r of removable) {
  console.log(`  ${String(r.p.created_at).slice(0, 19)}  ours=${r.p.status.padEnd(8)} stripe=${r.stripeStatus}  $${r.p.amount}`);
}

writeFileSync(`${SP}/payments-removed.json`, JSON.stringify(removable, null, 2), "utf8");
console.log(`\nrecorded to ${SP}/payments-removed.json`);

if (!process.argv.includes("--apply")) {
  console.log("DRY RUN -- nothing deleted. Re-run with --apply.");
  process.exit(0);
}
if (removable.length === 0) process.exit(0);

const { error, count } = await db
  .from("payment_records")
  .delete({ count: "exact" })
  .in(
    "id",
    removable.map((r) => r.p.id),
  );
console.log(error ? `delete failed: ${error.message}` : `deleted ${count} payment_records`);

const { data: left } = await db.from("payment_records").select("status");
const agg = {};
for (const p of left ?? []) agg[p.status] = (agg[p.status] ?? 0) + 1;
console.log(`remaining: ${JSON.stringify(agg)}`);
