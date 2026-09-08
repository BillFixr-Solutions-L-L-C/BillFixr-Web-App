import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, COMMITMENT_FEE_CENTS, MIN_CHARGE_CENTS } from "@/lib/stripe";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Every dollar amount here is computed server-side from real DB columns
// (or the fixed $5 commitment fee) — the client never supplies an amount,
// for either payment type. That's the whole reason this route exists
// instead of letting the client talk to Stripe directly.
export async function POST(request: Request) {
  const body = await request.json();
  const { type } = body;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (type === "commitment_fee") {
    return handleCommitmentFee(supabase, user.id, body.billId);
  }
  if (type === "success_fee") {
    return handleSuccessFee(supabase, user.id, body.caseId);
  }
  return NextResponse.json({ error: "invalid request" }, { status: 400 });
}

async function handleCommitmentFee(supabase: SupabaseClient, userId: string, billId: unknown) {
  if (typeof billId !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: bill } = await supabase.from("bills").select("id, user_id").eq("id", billId).single();
  if (!bill || bill.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Idempotency layer 1 (DB): reuse an existing non-failed record for this
  // bill instead of writing a second payment_records row — a double-click
  // or a user returning to an unfinished payment shouldn't produce two
  // rows pointing at what should be the same charge.
  const { data: existing } = await admin
    .from("payment_records")
    .select("processor_ref, status")
    .eq("bill_id", billId)
    .eq("type", "commitment_fee")
    .neq("status", "failed")
    .maybeSingle();

  return createOrReuseIntent({
    admin,
    existing,
    amountCents: COMMITMENT_FEE_CENTS,
    insertRow: { user_id: userId, bill_id: billId, case_id: null, type: "commitment_fee" },
    metadata: { userId, type: "commitment_fee", billId },
    // Idempotency layer 2 (Stripe): even if two requests race past the DB
    // check above at the same instant, the same key means Stripe itself
    // returns the original PaymentIntent instead of creating a second one.
    idempotencyKey: `commitment_fee:${billId}`,
  });
}

async function handleSuccessFee(supabase: SupabaseClient, userId: string, caseId: unknown) {
  if (typeof caseId !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, errors_detected, savings_found")
    .eq("id", caseId)
    .single();
  if (!caseRow || caseRow.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // "If no errors are found, that's all you ever pay — no success fee."
  // Nothing to charge or track; don't write a payment_records row at all.
  if (caseRow.errors_detected === 0) {
    return NextResponse.json({ noFeeOwed: true });
  }

  if (caseRow.savings_found == null) {
    return NextResponse.json({ error: "case not yet analyzed" }, { status: 409 });
  }

  const admin = createAdminClient();

  const { data: settings } = await admin.from("app_settings").select("success_fee_percentage").eq("id", 1).single();
  const percentage = settings?.success_fee_percentage ?? 30;

  const { data: commitmentPaid } = await admin
    .from("payment_records")
    .select("amount")
    .eq("case_id", caseId)
    .eq("type", "commitment_fee")
    .eq("status", "paid")
    .maybeSingle();

  const grossCents = Math.round(Number(caseRow.savings_found) * (Number(percentage) / 100) * 100);
  const alreadyPaidCents = Math.round(Number(commitmentPaid?.amount ?? 0) * 100);
  const netCents = grossCents - alreadyPaidCents;

  const { data: existing } = await admin
    .from("payment_records")
    .select("processor_ref, status")
    .eq("case_id", caseId)
    .eq("type", "success_fee")
    .neq("status", "failed")
    .maybeSingle();

  // Net amount doesn't clear Stripe's own minimum charge — the commitment
  // fee already covers it. Mark it paid directly; nothing to actually
  // charge, so no PaymentIntent involved at all.
  if (netCents < MIN_CHARGE_CENTS) {
    if (existing?.status === "paid") {
      return NextResponse.json({ noFeeOwed: true });
    }
    await admin.from("payment_records").insert({
      user_id: userId,
      case_id: caseId,
      type: "success_fee",
      amount: Math.max(netCents, 0) / 100,
      status: "paid",
      processor_ref: null,
    });
    // No Stripe payment involved, so no webhook will fire to complete the
    // case — do it directly here instead, same end state either way.
    await admin.from("cases").update({ status: "paid" }).eq("id", caseId);
    return NextResponse.json({ noFeeOwed: true });
  }

  return createOrReuseIntent({
    admin,
    existing,
    amountCents: netCents,
    insertRow: { user_id: userId, bill_id: null, case_id: caseId, type: "success_fee" },
    metadata: { userId, type: "success_fee", caseId },
    idempotencyKey: `success_fee:${caseId}`,
  });
}

async function createOrReuseIntent({
  admin,
  existing,
  amountCents,
  insertRow,
  metadata,
  idempotencyKey,
}: {
  admin: ReturnType<typeof createAdminClient>;
  existing: { processor_ref: string | null; status: string } | null;
  amountCents: number;
  insertRow: { user_id: string; bill_id: string | null; case_id: string | null; type: string };
  metadata: Record<string, string>;
  idempotencyKey: string;
}) {
  if (existing?.processor_ref) {
    if (existing.status === "paid") {
      return NextResponse.json({ alreadyPaid: true });
    }
    const intent = await stripe.paymentIntents.retrieve(existing.processor_ref);
    if (intent.status !== "canceled" && intent.client_secret) {
      return NextResponse.json({ clientSecret: intent.client_secret, intentId: intent.id, amount: intent.amount / 100 });
    }
  }

  const intent: Stripe.PaymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      metadata,
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey },
  );

  const { error } = await admin.from("payment_records").insert({
    ...insertRow,
    amount: amountCents / 100,
    status: "pending",
    processor_ref: intent.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clientSecret: intent.client_secret, intentId: intent.id, amount: amountCents / 100 });
}
