import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Polled by the client after stripe.confirmPayment() resolves, to wait for
// the webhook (the actual source of truth) to land before moving the UI
// forward — same poll-until-server-confirms pattern already used in
// CheckYourEmail.tsx for cross-device signup confirmation, for the same
// reason: a client-side "it looked successful" isn't proof.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const intentId = searchParams.get("intentId");
  if (!intentId) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Session-scoped client — payment_records_select_own_or_admin already
  // restricts this to the caller's own rows, so a guessed/enumerated
  // intent id can't leak another user's payment status.
  const { data: record } = await supabase
    .from("payment_records")
    .select("status, case_id")
    .eq("processor_ref", intentId)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ status: record.status, caseId: record.case_id });
}
