import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationEngineError, approveHeldSettlement } from "@/lib/automation-engine";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isBackendConfigured } from "@/lib/aiStack";

// The way out of HELD_FOR_REVIEW.
//
// The engine holds a settlement when AUTOPILOT_HOLD_FOR_REVIEW is on and a
// finding is below `high` confidence, so nothing is agreed off an audit no
// person has checked. Until this route existed there was no way to release
// one: a production run on 2026-11-06 had a hospital accept $363 against a
// $3,400 balance and the case stopped there, with the customer told their
// provider had responded and nothing left that would ever finish it.
//
// Deliberately takes no amount. The engine settles at the figure it stored
// when it held the case — the one the hospital actually agreed to. An admin
// who wants a different number uses the manual accept path, which records
// that it was a human's figure.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  // Same gate as the negotiation override panel: approving a settlement
  // commits the client to an amount, so it needs full access to the
  // negotiation domain, not merely an admin account.
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  const { data: caseRow } = await supabase.from("cases").select("id, negotiation_id").eq("id", id).single();
  if (!caseRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!caseRow.negotiation_id) {
    return NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 409 });
  }

  try {
    const negotiation = await approveHeldSettlement(caseRow.negotiation_id);
    return NextResponse.json(negotiation);
  } catch (err) {
    // 409 is the engine telling us there is nothing to approve — either it
    // is not held, or it is held with no agreed figure. That is the
    // admin's answer, not a server fault, so pass it through rather than
    // reporting the engine as broken.
    if (err instanceof AutomationEngineError && err.status === 409) {
      return NextResponse.json({ error: "There is no held settlement to approve on this case." }, { status: 409 });
    }
    console.error("Could not approve the held settlement for case", id, err);
    return NextResponse.json({ error: "We couldn't approve the settlement. Please try again." }, { status: 502 });
  }
}
