import { agreedSavings, patientBalance } from "@/lib/negotiationStatus";
import type { AutomationNegotiation } from "@/types/automation-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

// Writes the agreed settlement back onto the case.
//
// `cases.savings_found` is the basis of the success fee --
// /api/payments/create-intent multiplies it by the configured percentage
// and charges the result. Until now it was written in exactly one place:
// the analysis step, from the AUDIT'S ESTIMATE of what might be wrong
// with the bill. Nothing ever updated it when a hospital actually
// settled.
//
// So the fee was a share of a guess made before anyone had written to the
// provider. docs/FEES.md says the fee is a share of the reduction, and
// its own formula is `original − corrected`; the code was not doing that.
// On the first real settlement the estimate was $278.54 and the agreed
// reduction $316.04 -- close enough to look right, far enough to be
// wrong, and nothing guarantees the gap falls in the customer's favour.
// An audit that estimates $1,500 against a hospital that concedes $200
// would have billed $300 on a $200 saving.
//
// The engine is the only thing that knows what was agreed, so this runs
// wherever we already ask it: the per-case negotiation read and the daily
// cron.

export type SettlementFigures = { savingsFound: number; adjustedTotal: number };

export type SettlementSyncResult =
  | { written: false; reason: "no_settlement" | "no_reduction" | "fee_already_charged" | "unchanged" }
  | { written: true; figures: SettlementFigures };

/**
 * Reconciles one case's money columns with the engine's settlement.
 *
 * A no-op until a settlement exists, so the common case costs nothing --
 * a negotiation still waiting on a reply does not touch the database.
 */
export async function syncSettlementFigures(
  admin: SupabaseClient,
  caseRow: { id: string; savings_found?: number | null; adjusted_total?: number | null },
  negotiation: Pick<
    AutomationNegotiation,
    "total_billed" | "original_balance_due" | "settled_amount"
  >,
): Promise<SettlementSyncResult> {
  if (negotiation.settled_amount == null) {
    return { written: false, reason: "no_settlement" };
  }

  const savingsFound = agreedSavings(negotiation);
  if (savingsFound == null) {
    // Settled at or above what the patient owed. There is no reduction to
    // charge a share of, and writing a zero or a negative here would make
    // a fee out of nothing.
    return { written: false, reason: "no_reduction" };
  }

  // Never move the basis of a fee that has already been charged. If a
  // settlement is later revised, the customer's invoice must still match
  // the figure it was calculated from -- the fix for that is a refund, in
  // the open, not a column quietly changing underneath a receipt.
  const { data: chargedFee } = await admin
    .from("payment_records")
    .select("id")
    .eq("case_id", caseRow.id)
    .eq("type", "success_fee")
    .eq("status", "paid")
    .maybeSingle();
  if (chargedFee) {
    return { written: false, reason: "fee_already_charged" };
  }

  const adjustedTotal = negotiation.settled_amount;
  const same =
    caseRow.savings_found != null &&
    Math.abs(Number(caseRow.savings_found) - savingsFound) < 0.005 &&
    caseRow.adjusted_total != null &&
    Math.abs(Number(caseRow.adjusted_total) - adjustedTotal) < 0.005;
  if (same) {
    return { written: false, reason: "unchanged" };
  }

  const { error } = await admin
    .from("cases")
    .update({ savings_found: savingsFound, adjusted_total: adjustedTotal })
    .eq("id", caseRow.id);
  if (error) {
    throw new Error(`Could not write the settlement figures for case ${caseRow.id}: ${error.message}`);
  }

  return { written: true, figures: { savingsFound, adjustedTotal } };
}

/** What the customer owed before the dispute, for callers that need to
 *  show the before-and-after rather than only the difference. */
export { patientBalance };
