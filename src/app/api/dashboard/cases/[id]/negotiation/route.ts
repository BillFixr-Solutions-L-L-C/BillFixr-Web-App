import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNegotiation } from "@/lib/automation-engine";
import { syncCaseFromNegotiation } from "@/lib/caseStatusSync";
import { startNegotiationForCase, type NegotiationNotStarted } from "@/lib/startNegotiation";
import { isBackendConfigured } from "@/lib/aiStack";

// The web app's end of the automation engine's negotiation lifecycle.
//
// POST starts one; GET reports how it is going. Both are scoped to the
// signed-in owner of the case — the engine itself trusts whoever holds
// the API key, so every check has to happen here.
//
// POST is the manual and retry path. The scan starts a negotiation on
// its own as soon as it has read the bill, which is the first moment all
// of src/lib/startNegotiation.ts's preconditions hold; this route exists
// for a case that never got one, and shares that same code so the two
// cannot drift apart.

type CaseRow = {
  id: string;
  user_id: string;
  // Read so the GET can reconcile it against the engine's negotiation
  // status — see syncCaseFromNegotiation.
  status: string;
  bill_id: string | null;
  negotiation_id: string | null;
};

type OwnedCase = { error: NextResponse; caseRow: null } | { error: null; caseRow: CaseRow };

async function loadOwnedCase(id: string): Promise<OwnedCase> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }), caseRow: null };
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, status, bill_id, negotiation_id")
    .eq("id", id)
    .single();
  // One answer for "no such case" and "not yours": an id that is not
  // yours should not be distinguishable from one that does not exist.
  if (!caseRow || caseRow.user_id !== user.id) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }), caseRow: null };
  }

  return { error: null, caseRow: caseRow as CaseRow };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedCase(id);
  if (owned.error) return owned.error;

  if (!owned.caseRow.negotiation_id) {
    return NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 404 });
  }
  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  try {
    const negotiation = await getNegotiation(owned.caseRow.negotiation_id);

    // Reconcile on read: the engine is the only thing that knows whether
    // the provider replied, and this is the call that asks it. Doing it
    // here means opening a case advances it, rather than waiting for the
    // nightly cron. A failure to sync must not fail the read — the
    // customer still gets the engine's live status either way.
    try {
      await syncCaseFromNegotiation(createAdminClient(), owned.caseRow, negotiation);
    } catch (syncError) {
      console.error("Could not sync case status for", id, syncError);
    }

    return NextResponse.json(negotiation);
  } catch (err) {
    console.error("Could not read negotiation for case", id, err);
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 502 });
  }
}

// Same codes and wording this route answered with before the logic
// moved into src/lib/startNegotiation.ts.
const BLOCKED_RESPONSE: Record<NegotiationNotStarted, [number, string]> = {
  engine_unavailable: [503, "The negotiation service is unavailable."],
  already_started: [409, "A negotiation has already been started for this case."],
  no_provider_email: [409, "Add the provider's billing department email before starting."],
  commitment_fee_unpaid: [402, "The commitment fee must be paid before starting."],
  bill_not_read: [409, "This bill hasn't been read yet."],
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedCase(id);
  if (owned.error) return owned.error;

  const result = await startNegotiationForCase(createAdminClient(), owned.caseRow);
  if (result.started) {
    return NextResponse.json(result.negotiation);
  }
  if ("blocked" in result) {
    const [status, error] = BLOCKED_RESPONSE[result.blocked];
    return NextResponse.json({ error }, { status });
  }
  if (result.failed === "link_lost") {
    console.error("Negotiation", result.negotiationId, "started but could not be linked to case", id, result.cause);
    return NextResponse.json({ error: "The negotiation started but could not be saved." }, { status: 500 });
  }
  console.error("Could not start a negotiation for case", id, result.cause);
  return NextResponse.json({ error: "We couldn't start the negotiation. Please try again." }, { status: 502 });
}
