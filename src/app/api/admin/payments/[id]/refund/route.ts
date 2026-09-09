import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, MIN_CHARGE_CENTS } from "@/lib/stripe";

// Gated by can_issue_refunds() (see roles.can_issue_refunds), not just
// is_admin() — same "money-moving action needs a higher bar" reasoning as
// can_delete_accounts/can_delete_bills.
//
// This route only ever *triggers* the refund via Stripe — it never writes
// payment_records.refunded_amount itself. The charge.refunded webhook is
// the source of truth for that, same discipline as payment confirmation
// itself never trusting the client or a synchronous API response.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: canRefund } = await supabase.rpc("can_issue_refunds");
  if (!canRefund) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: record } = await supabase
    .from("payment_records")
    .select("id, amount, refunded_amount, status, processor_ref")
    .eq("id", id)
    .maybeSingle();
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (record.status !== "paid" || !record.processor_ref) {
    return NextResponse.json({ error: "This payment has no charge to refund." }, { status: 400 });
  }

  const remainingCents = Math.round((Number(record.amount) - Number(record.refunded_amount)) * 100);
  const requestedCents =
    typeof body.amount === "number" && Number.isFinite(body.amount)
      ? Math.round(body.amount * 100)
      : remainingCents;

  if (requestedCents <= 0 || requestedCents > remainingCents) {
    return NextResponse.json({ error: "Refund amount must be between $0.01 and the remaining refundable amount." }, { status: 400 });
  }
  if (requestedCents < MIN_CHARGE_CENTS && requestedCents < remainingCents) {
    return NextResponse.json({ error: `Partial refunds must be at least $${(MIN_CHARGE_CENTS / 100).toFixed(2)}.` }, { status: 400 });
  }

  try {
    await stripe.refunds.create({ payment_intent: record.processor_ref, amount: requestedCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: caller } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  await supabase.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: caller?.name ?? "Unknown",
    action: "issued_refund",
    target_id: record.id,
    target_name: `$${(requestedCents / 100).toFixed(2)} refund`,
  });

  return NextResponse.json({ ok: true });
}
