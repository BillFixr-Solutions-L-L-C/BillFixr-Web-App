import { sendEmail } from "@/lib/email";
import { emailCopy, greeting } from "@/lib/emailCopy";
import { customerLanguage } from "@/lib/language";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { providerHasResponded } from "@/lib/negotiationStatus";
import { syncSettlementFigures } from "@/lib/settlementFigures";
import { notifyAdmins } from "@/lib/adminNotifications";
import type { AutomationNegotiation } from "@/types/automation-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyCustomer } from "@/lib/customerNotifications";

// The real trigger that `/api/dev/advance-case` stood in for.
//
// Until 2026-11-05 the only thing that moved a case to
// `response_received` was a customer clicking "(dev) simulate provider
// response" on their own case — so the status meant nothing. The engine
// reads the provider's actual email, so it is the one thing that knows
// whether a reply came. This translates its answer into the single
// `cases.status` the list view, the admin progress column and the
// customer's Response step all read.
//
// Deliberately the only writer of `response_received`. Two callers, both
// server-side: the per-case negotiation GET (so opening a case reconciles
// it immediately) and the cron (so a case nobody opens still advances).

// Statuses a case may be advanced *from*. Anything at or past the
// response — and anything finished — is left alone: this only ever moves
// a case forward to the point the provider replied, and never rewrites a
// settled, paid or closed case from the engine's view of the negotiation.
const ADVANCEABLE = new Set(["uploaded", "scanning", "analyzed", "letter_sent", "awaiting_response"]);

export const RESPONSE_RECEIVED_EMAIL = {
  subject: "Your provider responded",
  heading: "Your provider responded",
  body: "Good news - your provider has responded to your case. Review the details and next steps from your dashboard.",
};

export type CaseStatusSyncResult =
  | { changed: false; reason: "no_response_yet" | "status_not_advanceable" }
  | { changed: true; from: string; to: "response_received"; emailed: boolean };

/**
 * Moves one case to `response_received` when the engine says the provider
 * has written back. A no-op otherwise, and a no-op on a case already at
 * or past that point — which is what makes it safe to call on every poll
 * and keeps the notification to exactly one send per case.
 */
export async function syncCaseFromNegotiation(
  admin: SupabaseClient,
  caseRow: { id: string; user_id: string; status: string; savings_found?: number | null; adjusted_total?: number | null },
  negotiation: Pick<
    AutomationNegotiation,
    "status" | "total_billed" | "original_balance_due" | "settled_amount"
  >,
): Promise<CaseStatusSyncResult> {
  // The settlement figures first, and outside every early return below:
  // the success fee is computed from cases.savings_found, so the column
  // has to be right whatever the case's status does. A negotiation with
  // no settlement returns immediately without touching the database --
  // see src/lib/settlementFigures.ts.
  //
  // Deliberately here rather than beside each caller: both of this
  // function's callers need it, and a third would otherwise have to
  // remember.
  try {
    const settlement = await syncSettlementFigures(admin, caseRow, negotiation);
    // Only the first time a settlement figure lands on this case.
    // `adjusted_total` is written by the settlement sync and by an admin
    // uploading a corrected bill, and by nothing else -- so a null one
    // means no settlement has ever been recorded here. Gating on
    // `written` alone would tell the customer again every time a revised
    // settlement moved the figure by a cent.
    if (settlement.written && caseRow.adjusted_total == null) {
      await notifyCustomer(admin, {
        userId: caseRow.user_id,
        type: "settlement_reached",
        amount: settlement.figures.savingsFound,
      });
    }
  } catch (err) {
    // The status sync must still run. A case stuck on "awaiting a reply"
    // when the provider has answered is the more visible failure, and
    // the figures are retried on the next read either way.
    console.error("Could not sync settlement figures for", caseRow.id, err);
  }

  if (!providerHasResponded(negotiation.status)) {
    return { changed: false, reason: "no_response_yet" };
  }
  if (!ADVANCEABLE.has(caseRow.status)) {
    return { changed: false, reason: "status_not_advanceable" };
  }

  // Conditional on the status we read, so two concurrent polls cannot
  // both see `awaiting_response` and both send the email. The second
  // update matches no row.
  const { data: updated, error } = await admin
    .from("cases")
    .update({ status: "response_received" })
    .eq("id", caseRow.id)
    .eq("status", caseRow.status)
    .select("id");
  if (error) throw new Error(`Could not advance case ${caseRow.id}: ${error.message}`);
  if (!updated || updated.length === 0) {
    return { changed: false, reason: "status_not_advanceable" };
  }

  // Past the conditional update, so this runs exactly once per case:
  // whichever poll wins the race does the work, every other one matches
  // no row and returns above. That is what makes it safe to tell the team
  // here without them getting the same notice on every poll.
  //
  // A held settlement is the one that matters most. The engine parks it
  // when a finding needs a person, and until somebody opens that case the
  // negotiation cannot finish — there was nothing anywhere that said so.
  const held = negotiation.status === "HELD_FOR_REVIEW";
  await notifyAdmins(admin, {
    type: held ? "settlement_held" : "provider_replied",
    message: held
      ? `A provider replied and the settlement needs review before we accept — case ${caseRow.id.slice(0, 8)}`
      : `A provider replied — case ${caseRow.id.slice(0, 8)}`,
    domain: "negotiation",
  });

  // And the customer, in the same once-per-case block. The email below
  // says the same thing, but email is a message, not a record: someone
  // who opens the dashboard next week with the mail archived had no way
  // to see that the provider ever answered.
  await notifyCustomer(admin, { userId: caseRow.user_id, type: "provider_replied" });

  let emailed = false;
  // communication_language, not the display cookie: what the customer
  // chose when they first arrived is what we write to them in, however
  // they have since set the website. See src/lib/language.ts.
  const { data: profile } = await admin
    .from("profiles")
    .select("name, email, communication_language")
    .eq("id", caseRow.user_id)
    .single();
  if (profile?.email) {
    try {
      const copy = emailCopy("responseReceived", customerLanguage(profile));
      await sendEmail({
        to: profile.email,
        subject: copy.subject,
        html: renderEmailCard({
          title: copy.heading,
          heading: copy.heading,
          bodyHtml: emailParagraph(
            `${escapeHtml(greeting(profile.name, customerLanguage(profile)))} ${escapeHtml(copy.body)}`,
          ),
          cta: { text: copy.cta, href: "https://billfixr.com/dashboard/case" },
        }),
      });
      emailed = true;
    } catch (err) {
      // Best effort, exactly as the route this replaces had it: the status
      // change already succeeded and must not be rolled back over an email.
      console.error("Case status email failed for", caseRow.id, err);
    }
  }

  return { changed: true, from: caseRow.status, to: "response_received", emailed };
}
