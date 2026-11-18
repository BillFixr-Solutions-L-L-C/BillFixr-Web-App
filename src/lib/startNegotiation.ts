import type { SupabaseClient } from "@supabase/supabase-js";

import { isBackendConfigured } from "@/lib/aiStack";
import { auditBill, getNegotiation, startNegotiation } from "@/lib/automation-engine";
import { storedBillData } from "@/lib/engineBillData";
import type { AutomationNegotiation } from "@/types/automation-engine";
import { notifyCustomer } from "@/lib/customerNotifications";

// Starting a negotiation is the one call in this app that makes the
// engine write to a real hospital, so it lives in one place with its
// guards attached instead of being re-derived by each caller. Two call
// it: the end of the scan, which is the first moment every precondition
// actually holds, and the case's own POST route for a manual retry.
//
// Every read here uses the service role. bill_extractions has RLS on
// with no policies by design (migration 20261003000000), so a
// session-scoped client reads nothing from it — the POST route used to
// read it that way and therefore refused every single case as "this
// bill hasn't been read yet", which no test caught because the mock
// client has no RLS. Ownership is the caller's job: the route checks it
// before calling in, and the scan has already checked it to get here.

export type NegotiationNotStarted =
  | "engine_unavailable"
  | "already_started"
  | "no_provider_email"
  | "commitment_fee_unpaid"
  | "bill_not_read";

export type StartNegotiationResult =
  | { started: true; negotiation: AutomationNegotiation }
  | { started: false; blocked: NegotiationNotStarted }
  | { started: false; failed: "engine_refused"; cause: unknown }
  | { started: false; failed: "link_lost"; negotiationId: string; cause: unknown };

export type StartableCase = { id: string; bill_id: string | null; negotiation_id: string | null };

export async function startNegotiationForCase(
  admin: SupabaseClient,
  caseRow: StartableCase,
): Promise<StartNegotiationResult> {
  if (!isBackendConfigured("automation-engine")) {
    return { started: false, blocked: "engine_unavailable" };
  }
  // Not a failure: the negotiation exists, which is what the caller
  // wanted. A second start would strand the first along with any letters
  // it had already sent.
  if (caseRow.negotiation_id) {
    return { started: false, blocked: "already_started" };
  }

  const { data: bill } = await admin
    .from("bills")
    .select("id, provider_email, provider_support_email")
    .eq("id", caseRow.bill_id ?? "")
    .maybeSingle();
  if (!bill?.provider_email) {
    return { started: false, blocked: "no_provider_email" };
  }

  // Same gate the appeal letter uses: nothing goes to a provider on a
  // case that has not been paid for.
  const { data: paidFee } = await admin
    .from("payment_records")
    .select("processor_ref")
    .eq("bill_id", caseRow.bill_id)
    .eq("type", "commitment_fee")
    .eq("status", "paid")
    .maybeSingle();
  if (!paidFee) {
    return { started: false, blocked: "commitment_fee_unpaid" };
  }

  // The engine audits structured bill data, which is what the extraction
  // step produced. Without it there is nothing to negotiate from.
  const { data: stored } = await admin
    .from("bill_extractions")
    .select("engine_result, result")
    .eq("bill_id", caseRow.bill_id)
    .maybeSingle();
  // Prefers the engine's own reading, which carries the CPT and revenue
  // codes several audit rules are built on; falls back to the older
  // ai-service reading so a bill read before 2026-11-10 still negotiates.
  const billData = storedBillData(stored);
  if (!billData) {
    return { started: false, blocked: "bill_not_read" };
  }

  const { data: settings } = await admin
    .from("app_settings")
    .select("success_fee_percentage")
    .eq("id", 1)
    .maybeSingle();
  const feeRate = Number(settings?.success_fee_percentage);

  let negotiation: AutomationNegotiation;
  try {
    // Already in the engine's own shape -- flat `total_billed`, `cpt_code`
    // -- whichever reading it came from. Handing the ai-service's nested
    // shape over untranslated audits as a $0 bill with no charges and
    // reports nothing wrong. See src/lib/engineBillData.ts.
    const audit = await auditBill(billData);
    negotiation = await startNegotiation({
      auditResult: audit,
      // The opening position, not the one we expect to settle at — the
      // engine negotiates up from here.
      initialOffer: audit.settlement_options.aggressive_offer,
      hospitalEmail: bill.provider_email,
      supportEmail: bill.provider_support_email ?? undefined,
      caseId: caseRow.id,
      commitmentPaymentRef: paidFee.processor_ref ?? caseRow.id,
      completionFeeRate: Number.isFinite(feeRate) ? feeRate / 100 : undefined,
    });
  } catch (cause) {
    return { started: false, failed: "engine_refused", cause };
  }

  // Written before anything else happens: a lost link leaves the engine
  // writing to a hospital on a negotiation nothing in this app can find.
  //
  // Conditional on negotiation_id still being null, so two starts racing
  // cannot overwrite each other's link — the loser reports link_lost and
  // its negotiation id reaches the log rather than disappearing.
  const { data: linked, error: linkError } = await admin
    .from("cases")
    .update({
      negotiation_id: negotiation.id,
      // The engine sends the first dispute letter itself as part of
      // starting, so the case has genuinely moved past "scanning".
      // Stamping letter_sent_at also stops the manual send-letter route
      // adding a second letter to the same bill.
      status: "letter_sent",
      letter_sent_at: new Date().toISOString(),
      provider_email: bill.provider_email,
    })
    .eq("id", caseRow.id)
    .is("negotiation_id", null)
    // user_id comes back from the update that already had to run, rather
    // than from a second read or a wider StartableCase every caller would
    // have to remember to select.
    .select("id, user_id");

  if (!linkError && linked && linked.length === 1) {
    // Only the start that won the `negotiation_id is null` race gets here,
    // so the customer is told once that we have written to their provider.
    await notifyCustomer(admin, { userId: linked[0].user_id as string, type: "letter_sent" });
  }

  if (linkError || !linked || linked.length === 0) {
    return {
      started: false,
      failed: "link_lost",
      negotiationId: negotiation.id,
      cause: linkError ?? "another start linked a negotiation first",
    };
  }

  // The appeal letter is not a separate draft on the engine path: the
  // engine writes it and sends it as part of starting, so the text is
  // read back here. That makes cases.appeal_letter_text the letter the
  // provider actually received rather than a second draft nobody sent.
  //
  // This used to live in the scan route, which was the only caller that
  // started a negotiation. Since 2026-11-18 the scan stops at the
  // analysis and the customer's Proceed starts the negotiation, so the
  // readback belongs with the start itself -- otherwise whichever caller
  // was not updated silently leaves the case with no copy of its own
  // letter.
  try {
    const sent = await getNegotiation(negotiation.id);
    const letter = (sent.messages ?? []).find(
      (m) => m.direction === "OUTBOUND" && m.content_markdown,
    )?.content_markdown;
    if (letter) {
      await admin.from("cases").update({ appeal_letter_text: letter }).eq("id", caseRow.id);
    }
  } catch (cause) {
    // The letter went out either way. Not holding a copy of it is worth a
    // log line, not a failed start -- reporting failure here would tell
    // the customer nothing was sent when something was.
    console.error("Could not store the sent letter for case", caseRow.id, cause);
  }

  return { started: true, negotiation };
}

/**
 * Flattens a result for an API response and for logging. `running` folds
 * `already_started` in with success, because both mean a letter is out
 * and the caller has nothing left to do; `reason` is the tag, never
 * `cause`, which can carry an engine response and is for logs only.
 */
export function negotiationSummary(result: StartNegotiationResult): { running: boolean; reason: string | null } {
  if (result.started) return { running: true, reason: null };
  if ("blocked" in result) {
    return { running: result.blocked === "already_started", reason: result.blocked };
  }
  return { running: false, reason: result.failed };
}
