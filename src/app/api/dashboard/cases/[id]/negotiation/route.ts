import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditBill, getNegotiation, startNegotiation } from "@/lib/automation-engine";
import { isBackendConfigured } from "@/lib/aiStack";

// The web app's end of the automation engine's negotiation lifecycle.
//
// POST starts one; GET reports how it is going. Both are scoped to the
// signed-in owner of the case — the engine itself trusts whoever holds
// the API key, so every check has to happen here.
//
// Starting a negotiation makes the engine write to a real hospital, so
// the guards below are not ceremony: a case can only start one once, the
// commitment fee must already be paid, and the bill must have been read.

type CaseRow = {
  id: string;
  user_id: string;
  bill_id: string | null;
  negotiation_id: string | null;
};

type OwnedCase =
  | { error: NextResponse; supabase: null; caseRow: null }
  | { error: null; supabase: Awaited<ReturnType<typeof createClient>>; caseRow: CaseRow };

async function loadOwnedCase(id: string): Promise<OwnedCase> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }), supabase: null, caseRow: null };
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, bill_id, negotiation_id")
    .eq("id", id)
    .single();
  // One answer for "no such case" and "not yours": an id that is not
  // yours should not be distinguishable from one that does not exist.
  if (!caseRow || caseRow.user_id !== user.id) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }), supabase: null, caseRow: null };
  }

  return { error: null, supabase, caseRow: caseRow as CaseRow };
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
    return NextResponse.json(await getNegotiation(owned.caseRow.negotiation_id));
  } catch (err) {
    console.error("Could not read negotiation for case", id, err);
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 502 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedCase(id);
  if (owned.error) return owned.error;
  const { supabase, caseRow } = owned;

  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }
  // Not an error worth failing on loudly: the negotiation exists, which
  // is what the caller wanted. Returning it keeps a double-click from
  // starting a second one, which would strand the first along with any
  // letters it had already sent.
  if (caseRow.negotiation_id) {
    return NextResponse.json({ error: "A negotiation has already been started for this case." }, { status: 409 });
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("id, provider_email, provider_support_email")
    .eq("id", caseRow.bill_id ?? "")
    .maybeSingle();
  if (!bill?.provider_email) {
    return NextResponse.json(
      { error: "Add the provider's billing department email before starting." },
      { status: 409 },
    );
  }

  // Same gate the appeal letter uses: nothing goes to a provider on a
  // case that has not been paid for.
  const { data: paidFee } = await supabase
    .from("payment_records")
    .select("processor_ref")
    .eq("bill_id", caseRow.bill_id)
    .eq("type", "commitment_fee")
    .eq("status", "paid")
    .maybeSingle();
  if (!paidFee) {
    return NextResponse.json({ error: "The commitment fee must be paid before starting." }, { status: 402 });
  }

  // The engine audits structured bill data, which is what the extraction
  // step produced. Without it there is nothing to negotiate from.
  const { data: extraction } = await supabase
    .from("bill_extractions")
    .select("result")
    .eq("bill_id", caseRow.bill_id)
    .maybeSingle();
  if (!extraction?.result) {
    return NextResponse.json({ error: "This bill hasn't been read yet." }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("success_fee_percentage")
    .eq("id", 1)
    .single();
  const feeRate = Number(settings?.success_fee_percentage);

  try {
    const audit = await auditBill(extraction.result as Record<string, unknown>);
    const negotiation = await startNegotiation({
      auditResult: audit,
      // The opening position, not the one we expect to settle at — the
      // engine negotiates up from here.
      initialOffer: audit.settlement_options.aggressive_offer,
      hospitalEmail: bill.provider_email,
      supportEmail: bill.provider_support_email ?? undefined,
      commitmentPaymentRef: paidFee.processor_ref ?? id,
      completionFeeRate: Number.isFinite(feeRate) ? feeRate / 100 : undefined,
    });

    // Stored before responding: if this write is lost, the engine is
    // already writing to the hospital on a negotiation nothing can find.
    const { error: linkError } = await admin
      .from("cases")
      .update({ negotiation_id: negotiation.id })
      .eq("id", id);
    if (linkError) {
      console.error("Negotiation", negotiation.id, "started but could not be linked to case", id, linkError);
      return NextResponse.json({ error: "The negotiation started but could not be saved." }, { status: 500 });
    }

    return NextResponse.json(negotiation);
  } catch (err) {
    console.error("Could not start a negotiation for case", id, err);
    return NextResponse.json({ error: "We couldn't start the negotiation. Please try again." }, { status: 502 });
  }
}
