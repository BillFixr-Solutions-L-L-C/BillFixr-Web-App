// Reconciles every payment_records row against Stripe itself.
//
// The question is not whether the table is tidy. It is whether any row we
// call `pending` or `failed` is one Stripe calls `succeeded` -- a customer
// who paid and got nothing, with no case and nothing in the product that
// would ever notice. The webhook is the only thing that flips these rows,
// so a webhook that was never delivered, or that threw, looks exactly like
// an abandoned checkout from inside the database.
//
// Read-only. Prints no secret.
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

const { data: pays } = await db
  .from("payment_records")
  .select("*")
  .order("created_at", { ascending: true });
const { data: profiles } = await db.from("profiles").select("id, email");
const { data: bills } = await db.from("bills").select("id, user_id, filename");
const { data: cases } = await db.from("cases").select("id, bill_id, status");

const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));
const billById = new Map((bills ?? []).map((b) => [b.id, b]));
const caseByBill = new Map((cases ?? []).map((c) => [c.bill_id, c]));

console.log(`${pays.length} payment_records\n`);

const mismatches = [];
const rows = [];

for (const p of pays) {
  let stripeStatus = "(no processor_ref)";
  let amountReceived = null;
  let livemode = null;
  if (p.processor_ref && /^pi_/.test(p.processor_ref)) {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${p.processor_ref}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    const body = await res.json();
    if (res.ok) {
      stripeStatus = body.status;
      amountReceived = body.amount_received;
      livemode = body.livemode;
    } else {
      stripeStatus = `ERROR ${res.status} ${body?.error?.code ?? ""}`;
    }
  }

  const bill = billById.get(p.bill_id);
  const kase = p.case_id ? (cases ?? []).find((c) => c.id === p.case_id) : caseByBill.get(p.bill_id);
  const owner = bill ? emailOf.get(bill.user_id) ?? "(unknown)" : "(bill deleted)";

  const row = {
    id: p.id,
    created: String(p.created_at).slice(0, 19),
    type: p.type,
    ours: p.status,
    stripe: stripeStatus,
    amount: p.amount,
    amountReceived,
    livemode,
    owner,
    bill: p.bill_id ? String(p.bill_id).slice(0, 8) : null,
    case: kase ? `${String(kase.id).slice(0, 8)}/${kase.status}` : null,
    ref: p.processor_ref ? String(p.processor_ref).slice(0, 14) + "…" : null,
  };
  rows.push(row);

  // The failure that matters: Stripe took the money, we did not record it.
  if (stripeStatus === "succeeded" && p.status !== "paid") {
    mismatches.push(row);
  }
}

console.log("created              type            ours     stripe                 owner");
for (const r of rows) {
  const flag = r.stripe === "succeeded" && r.ours !== "paid" ? "  <-- MONEY TAKEN, NOT RECORDED" : "";
  console.log(
    `${r.created}  ${String(r.type).padEnd(15)} ${String(r.ours).padEnd(8)} ${String(r.stripe).padEnd(22)} ${r.owner}${flag}`,
  );
}

console.log(`\nrows where Stripe succeeded but we did not mark it paid: ${mismatches.length}`);
for (const m of mismatches) {
  console.log(`  ${m.id}  ref=${m.ref}  bill=${m.bill}  case=${m.case ?? "NONE"}  amount_received=${m.amountReceived}`);
}

const byPair = {};
for (const r of rows) {
  const k = `${r.ours} / ${r.stripe}`;
  byPair[k] = (byPair[k] ?? 0) + 1;
}
console.log(`\nours / stripe: ${JSON.stringify(byPair, null, 2)}`);

writeFileSync(`${SP}/payment-audit.json`, JSON.stringify({ rows, mismatches }, null, 2), "utf8");
console.log(`\nwritten to ${SP}/payment-audit.json`);
