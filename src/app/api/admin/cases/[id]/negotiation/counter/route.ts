import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationEngineError, getNegotiation, sendCounterOffer, setAutopilot } from "@/lib/automation-engine";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isBackendConfigured } from "@/lib/aiStack";
import { patientBalance } from "@/lib/negotiationStatus";

// A counter-offer written by a person, and the switch that stops
// autopilot writing one by itself.
//
// Autopilot counters when a dispute is rejected, and holds for review
// when a finding is below `high` confidence. What was missing was both
// ends of the manual path: a case autopilot had stopped on could only be
// approved at the figure already on the table, and there was no way to
// come back with a different number. Neither endpoint had a caller.
//
// POST sends the counter. PATCH flips autopilot for this case.
//
// The letter is dispatched to a real hospital billing department exactly
// as given. The engine does not compose it and neither does this route —
// whatever a person writes is what the provider reads.

const MIN_LETTER = 40;

async function authorise(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  // Sending to a provider and disabling the automation are both things
  // that change what the client's case does, so both need full access to
  // the negotiation domain rather than merely an admin account.
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"))) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  if (!isBackendConfigured("automation-engine")) {
    return { error: NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 }) } as const;
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, status, negotiation_id")
    .eq("id", id)
    .single();
  if (!caseRow) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  }
  if (!caseRow.negotiation_id) {
    return {
      error: NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 409 }),
    } as const;
  }
  return { error: null, negotiationId: caseRow.negotiation_id as string } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorise(id);
  if (auth.error) return auth.error;

  let amount: number;
  let letter: string;
  try {
    const body = (await request.json()) as { amount?: unknown; letter?: unknown };
    amount = Number(body?.amount);
    letter = typeof body?.letter === "string" ? body.letter.trim() : "";
  } catch {
    return NextResponse.json({ error: "Enter the amount and the letter to send." }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter the amount you are offering." }, { status: 400 });
  }
  amount = Math.round(amount * 100) / 100;

  if (letter.length < MIN_LETTER) {
    // This goes to a hospital as-is. A blank or one-line body would be
    // sent exactly as given, over our own advocate address.
    return NextResponse.json(
      { error: "Write the letter that should go to the provider — this is sent exactly as typed." },
      { status: 400 },
    );
  }

  let negotiation;
  try {
    negotiation = await getNegotiation(auth.negotiationId);
  } catch (err) {
    console.error("Could not read the negotiation before countering for case", id, err);
    return NextResponse.json(
      { error: "We couldn't reach the negotiation service. Please try again." },
      { status: 502 },
    );
  }

  if (negotiation.settled_amount != null) {
    return NextResponse.json({ error: "This case has already been settled." }, { status: 409 });
  }

  const owed = patientBalance(negotiation);
  if (amount >= owed) {
    // Offering the provider at least what the client already owes is not
    // a negotiating position, it is a capitulation sent by accident.
    return NextResponse.json(
      {
        error: `That is not an offer — the client already owes ${owed.toFixed(2)}.`,
        patientBalance: owed,
      },
      { status: 409 },
    );
  }

  try {
    const updated = await sendCounterOffer(auth.negotiationId, { revisedOffer: amount, letterText: letter });
    return NextResponse.json({ status: "success", negotiation: updated });
  } catch (err) {
    if (err instanceof AutomationEngineError && err.status === 404) {
      return NextResponse.json({ error: "The negotiation service has no record of this case." }, { status: 409 });
    }
    console.error("Could not send the counter-offer for case", id, err);
    return NextResponse.json({ error: "We couldn't send the counter-offer. Please try again." }, { status: 502 });
  }
}

// The brake. Autopilot defaults to on and answers the provider by itself;
// this is how a person stops it on one case.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorise(id);
  if (auth.error) return auth.error;

  let enabled: boolean;
  try {
    const body = (await request.json()) as { enabled?: unknown };
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "Say whether autopilot should be on or off." }, { status: 400 });
    }
    enabled = body.enabled;
  } catch {
    return NextResponse.json({ error: "Say whether autopilot should be on or off." }, { status: 400 });
  }

  try {
    const result = await setAutopilot(auth.negotiationId, enabled);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Could not toggle autopilot for case", id, err);
    return NextResponse.json({ error: "We couldn't change the automation setting." }, { status: 502 });
  }
}
