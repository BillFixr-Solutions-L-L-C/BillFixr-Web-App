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
  // same event id). A unique-violation here means this event is already
  // claimed — no-op, return 200 immediately. The row is a claim, not a
  // receipt: the catch below removes it again if the work failed, so a
  // retry can pick it back up.
  const { error: dedupeError } = await admin.from("stripe_events").insert({ id: event.id });
  if (dedupeError) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await handleSucceeded(admin, event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "payment_intent.payment_failed") {
      await handleFailed(admin, event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "charge.refunded") {
      await handleRefunded(admin, event.data.object as Stripe.Charge);
    } else if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed"
    ) {
      await handleDispute(admin, event.data.object as Stripe.Dispute);
    }
    // Every other event type is a deliberate no-op — only react to the
    // above; never error on an unrecognized type, or Stripe retries it
    // forever.
  } catch (err) {
    console.error("Stripe webhook handler error for event", event.id, err);
    // Release the claim and ask Stripe to retry. This used to log and
    // return 200, which meant a handler that threw halfway left the
    // customer charged with no case created and no way back: Stripe saw
    // success so it never retried, and the dedupe row below made even a
    // manual redelivery a no-op. Stripe's retries are bounded (backoff
    // over ~3 days, then it surfaces the failure in the Dashboard), so
    // retrying is strictly better than silently losing a paid event.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
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
    // create-intent writes the row before the client can confirm, so this
    // is normally impossible — but Stripe can deliver the webhook very
    // fast, and losing a paid event to a race is exactly the failure this
    // route exists to prevent. Throw so the caller retries instead of
    // accepting the event; if the row genuinely never appears, Stripe
    // gives up after its backoff window and flags it, which is still more
    // visible than swallowing it.
    throw new Error(`payment_intent.succeeded with no matching payment_records row: ${intent.id}`);
  }

  // Real card brand/last-4 for the admin payments table — not from any
  // field already on the webhook payload, since `payment_method` there is
  // just an id string, not the expanded object. A no-op for the sub-$0.50
  // success-fee case (Step 7), which is marked paid with no real charge
  // and thus no `payment_method` at all.
  // Deliberately NOT an early return when the record is already paid: a
  // retry after a half-finished run must still reach the case work below,
  // which is what the customer actually paid for. Everything below is
  // safe to repeat.
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  if (record.status !== "paid" && typeof intent.payment_method === "string") {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(intent.payment_method);
      cardBrand = paymentMethod.card?.brand ?? null;
      cardLast4 = paymentMethod.card?.last4 ?? null;
    } catch (err) {
      // Best-effort — the payment itself already succeeded; a failure to
      // fetch its display details shouldn't block marking it paid.
      console.error("Failed to retrieve payment method details for", intent.id, err);
    }
  }

  if (record.status !== "paid") {
    const { error: payError } = await admin
      .from("payment_records")
      .update({ status: "paid", card_brand: cardBrand, card_last4: cardLast4 })
      .eq("id", record.id);
    if (payError) throw new Error(`Failed to mark payment paid: ${payError.message}`);
  }

  if (record.type === "commitment_fee" && record.bill_id) {
    // Defense in depth on top of the event-dedupe table above: never
    // create a second case for the same bill even if this handler somehow
    // runs twice for one payment.
    const { data: existingCase } = await admin.from("cases").select("id").eq("bill_id", record.bill_id).maybeSingle();
    if (!existingCase) {
      const { data: bill } = await admin.from("bills").select("user_id").eq("id", record.bill_id).maybeSingle();
      if (!bill) {
        throw new Error(`Paid commitment fee for a bill that no longer exists: ${record.bill_id}`);
      }
      const { data: newCase, error: caseError } = await admin
        .from("cases")
        .insert({ bill_id: record.bill_id, user_id: bill.user_id, status: "scanning" })
        .select("id")
        .single();
      // The case is the thing the fee buys, so a failure here has to be
      // loud enough to be retried rather than quietly dropped.
      if (caseError || !newCase) {
        throw new Error(`Failed to create case for paid bill ${record.bill_id}: ${caseError?.message ?? "no row returned"}`);
      }
      await admin.from("payment_records").update({ case_id: newCase.id }).eq("id", record.id);
    }
  } else if (record.type === "success_fee" && record.case_id) {
    // Paying the success fee is what actually completes a case in the
    // resolved -> payment_pending -> paid -> closed state machine.
    const { error: caseError } = await admin.from("cases").update({ status: "paid" }).eq("id", record.case_id);
    if (caseError) {
      throw new Error(`Failed to complete case ${record.case_id}: ${caseError.message}`);
    }
  }
}

async function handleFailed(admin: ReturnType<typeof createAdminClient>, intent: Stripe.PaymentIntent) {
  await admin.from("payment_records").update({ status: "failed" }).eq("processor_ref", intent.id).neq("status", "paid");
}

// Source of truth for how much of a payment has actually been refunded —
// never the admin route that triggers the refund (see /api/admin/payments/
// [id]/refund), same "the webhook confirms, nothing else does" discipline
// as payment confirmation itself. charge.amount_refunded is cumulative (in
// cents), so this is a plain overwrite, not an increment — safe to run
// more than once for the same event or across multiple partial refunds.
async function handleRefunded(admin: ReturnType<typeof createAdminClient>, charge: Stripe.Charge) {
  if (typeof charge.payment_intent !== "string") return;

  const { error } = await admin
    .from("payment_records")
    .update({ refunded_amount: charge.amount_refunded / 100 })
    .eq("processor_ref", charge.payment_intent);

  if (error) {
    console.error("Failed to record refund for payment_intent", charge.payment_intent, error);
  }
}

// Disputes are always Stripe/bank-initiated — there's no admin action that
// creates one, only this handler ever writes payment_disputes. Upserted on
// stripe_dispute_id so created -> updated -> closed all collapse onto the
// same row instead of piling up duplicates for one dispute's lifecycle.
async function handleDispute(admin: ReturnType<typeof createAdminClient>, dispute: Stripe.Dispute) {
  if (typeof dispute.payment_intent !== "string") return;

  const { data: record } = await admin
    .from("payment_records")
    .select("id")
    .eq("processor_ref", dispute.payment_intent)
    .maybeSingle();

  if (!record) {
    console.error("Dispute event with no matching payment_records row:", dispute.id);
    return;
  }

  const { error } = await admin.from("payment_disputes").upsert(
    {
      payment_record_id: record.id,
      stripe_dispute_id: dispute.id,
      amount: dispute.amount / 100,
      reason: dispute.reason,
      status: dispute.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_dispute_id" },
  );

  if (error) {
    console.error("Failed to upsert dispute", dispute.id, error);
  }
}
