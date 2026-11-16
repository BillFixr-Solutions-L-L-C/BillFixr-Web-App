// Is production Stripe the same test-mode account as .env.local?
//
// Decided by fact, not inference: look up a payment intent that production
// actually created, using the local key. A test-mode key can only see
// test-mode objects, so if it resolves, production is test mode too.
//
// Prints no secret -- only the mode and the intent's own fields.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const key = env.STRIPE_SECRET_KEY;
console.log(`local key mode: ${key.startsWith("sk_test") || key.startsWith("rk_test") ? "TEST" : "LIVE"}`);

// Both intents production recorded as paid.
const intents = ["pi_3UaSGPQcsaey5U683ChF5QQ1", "pi_3UaGrvQcsaey5U6850glybwZ"];

for (const id of intents) {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json();
  if (!res.ok) {
    console.log(`\n${id} -> HTTP ${res.status}: ${body?.error?.type} / ${body?.error?.code ?? ""}`);
    console.log(`   ${String(body?.error?.message ?? "").slice(0, 160)}`);
    continue;
  }
  console.log(`\n${id} -> HTTP 200`);
  console.log(`   livemode  ${body.livemode}`);
  console.log(`   status    ${body.status}`);
  console.log(`   amount    ${body.amount} ${body.currency}`);
  console.log(`   created   ${new Date(body.created * 1000).toISOString()}`);
}
