import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationEngineError, acceptOffer, getNegotiation } from "@/lib/automation-engine";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isBackendConfigured } from "@/lib/aiStack";
import { patientBalance, providerHasResponded } from "@/lib/negotiationStatus";
import { syncSettlementFigures } from "@/lib/settlementFigures";

// Accepting a provider's offer at a figure a person chose.
//
// The engine has had this endpoint all along and nothing called it. What
// existed was `review/approve`, which releases a settlement autopilot had
// already decided on and parked -- it takes no amount, because the only
// figure it may settle at is the one the hospital agreed to. There was no
// way to close at any other number, so a case where the provider offered
// something over the phone, or countered in a way autopilot would not
// take, had no ending at all.
//
// This is deliberately an admin action, not a customer one. It commits
// the client to an amount and starts the success fee.
//
// The engine's own default is why the amount is required here rather than
// optional: POST /accept falls back to `current_demanded_balance` and
// then to a hardcoded 175.00 when given nothing. A settlement must never
// be a number nobody chose.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Same gate as approving a held settlement and closing a case: this
  // commits the client to an amount, so it needs full access to the
  // negotiation domain rather than merely an admin account.
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  let amount: number;
  try {
    const body = (await request.json()) as { amount?: unknown };
    amount = Number(body?.amount);
  } catch {
    return NextResponse.json({ error: "Enter the amount the provider agreed to." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter the amount the provider agreed to." }, { status: 400 });
  }
  // Money, to the cent. A settlement with a fraction of a cent in it
  // cannot be reconciled against anything the provider sends.
  amount = Math.round(amount * 100) / 100;

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, status, negotiation_id, savings_found, adjusted_total")
    .eq("id", id)
    .single();
  if (!caseRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!caseRow.negotiation_id) {
    return NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 409 });
  }

  let negotiation;
  try {
    negotiation = await getNegotiation(caseRow.negotiation_id);
  } catch (err) {
    console.error("Could not read the negotiation before accepting for case", id, err);
    return NextResponse.json(
      { error: "We couldn't reach the negotiation service. Please try again." },
      { status: 502 },
    );
  }

  if (negotiation.settled_amount != null) {
    return NextResponse.json(
      { error: "This case has already been settled.", settledAmount: negotiation.settled_amount },
      { status: 409 },
    );
  }
  if (!providerHasResponded(negotiation.status)) {
    // There is nothing to accept. Recording a settlement here would tell
    // the customer their provider agreed to something when the provider
    // has not written back at all.
    return NextResponse.json(
      { error: "The provider hasn't responded yet, so there is no offer to accept." },
      { status: 409 },
    );
  }

  // A "settlement" at or above what the patient already owed is not a
  // settlement. It would record a reduction of zero or less and, with the
  // success fee being a share of the reduction, bill them for nothing.
  const owed = patientBalance(negotiation);
  if (amount >= owed) {
    return NextResponse.json(
      {
        error: `That is not a reduction — the client already owes ${owed.toFixed(2)}. Enter the lower figure the provider agreed to.`,
        patientBalance: owed,
      },
      { status: 409 },
    );
  }

  let settled;
  try {
    settled = await acceptOffer(caseRow.negotiation_id, amount);
  } catch (err) {
    if (err instanceof AutomationEngineError && err.status === 404) {
      return NextResponse.json({ error: "The negotiation service has no record of this case." }, { status: 409 });
    }
    console.error("Could not accept the settlement for case", id, err);
    return NextResponse.json({ error: "We couldn't record the settlement. Please try again." }, { status: 502 });
  }

  // The success fee is computed from cases.savings_found, so the case has
  // to carry the figure that was just agreed before anyone is charged.
  // Same writer the negotiation read and the cron use.
  const admin = createAdminClient();
  try {
    await syncSettlementFigures(admin, caseRow, settled);
  } catch (err) {
    // The settlement itself is recorded with the engine, which is the
    // part that cannot be redone. The figures are rewritten on the next
    // read of this case either way.
    console.error("Accepted the settlement but could not write the figures for case", id, err);
  }

  return NextResponse.json({ status: "success", negotiation: settled });
}
