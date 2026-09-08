import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Source of truth for payment confirmation — never the client. Verifies
// Stripe's signature against the RAW request body (stripe.webhooks.
// constructEvent needs the exact bytes; parsing to JSON first and
// re-serializing breaks the signature check even though the data looks
// identical). Next's App Router Route Handlers don't auto-parse the body,
// so request.text() just works here with no special route config.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency: Stripe can and does deliver the same event more than
  // once (retries, manual redelivery from the Dashboard, which reuses the
  // same event id). A unique-violation here means this event was already
  // processed — no-op, return 200 immediately.
  const { error: dedupeError } = await admin.from("stripe_events").insert({ id: event.id });
  if (dedupeError) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await handleSucceeded(admin, event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "payment_intent.payment_failed") {
      await handleFailed(admin, event.data.object as Stripe.PaymentIntent);
    }
    // Every other event type is a deliberate no-op — only react to the two
    // above; never error on an unrecognized type, or Stripe retries it
    // forever.
  } catch (err) {
    // Log and still return 200 — a bug on our side retrying forever
    // against Stripe is worse than losing visibility into one event; the
    // dedupe row already means a retry wouldn't reprocess this anyway.
    console.error("Stripe webhook handler error for event", event.id, err);
  }

  return NextResponse.json({ ok: true });
}

async function handleSucceeded(admin: ReturnType<typeof createAdminClient>, intent: Stripe.PaymentIntent) {
  const { data: record } = await admin
    .from("payment_records")
    .select("id, type, bill_id, case_id, status")
    .eq("processor_ref", intent.id)
    .maybeSingle();

  if (!record) {
    // Shouldn't happen — create-intent always writes the row before the
    // client can confirm — but "shouldn't happen" isn't a guarantee with
    // an external system. Log it and move on rather than throwing.
    console.error("payment_intent.succeeded with no matching payment_records row:", intent.id);
    return;
  }
  if (record.status === "paid") return;

  await admin.from("payment_records").update({ status: "paid" }).eq("id", record.id);

  if (record.type === "commitment_fee" && record.bill_id) {
    // Defense in depth on top of the event-dedupe table above: never
    // create a second case for the same bill even if this handler somehow
    // runs twice for one payment.
    const { data: existingCase } = await admin.from("cases").select("id").eq("bill_id", record.bill_id).maybeSingle();
    if (!existingCase) {
      const { data: bill } = await admin.from("bills").select("user_id").eq("id", record.bill_id).maybeSingle();
      if (bill) {
        const { data: newCase } = await admin
          .from("cases")
          .insert({ bill_id: record.bill_id, user_id: bill.user_id, status: "scanning" })
          .select("id")
          .single();
        if (newCase) {
          await admin.from("payment_records").update({ case_id: newCase.id }).eq("id", record.id);
        }
      }
    }
  } else if (record.type === "success_fee" && record.case_id) {
    // Paying the success fee is what actually completes a case in the
    // resolved -> payment_pending -> paid -> closed state machine.
    await admin.from("cases").update({ status: "paid" }).eq("id", record.case_id);
  }
}

async function handleFailed(admin: ReturnType<typeof createAdminClient>, intent: Stripe.PaymentIntent) {
  await admin.from("payment_records").update({ status: "failed" }).eq("processor_ref", intent.id).neq("status", "paid");
}
