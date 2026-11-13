import { sendEmail } from "@/lib/email";
import { emailCopy } from "@/lib/emailCopy";
import { customerLanguage, type Language } from "@/lib/language";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { providerHasResponded } from "@/lib/negotiationStatus";
import type { AutomationNegotiation } from "@/types/automation-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** "Hi <name>," in the customer's language. Separate from the body copy
 *  because the name is interpolated and the punctuation differs. */
function greeting(name: string | null | undefined, language: Language): string {
  const who = (name ?? "").trim();
  if (language === "es") return who ? `Hola ${who},` : "Hola,";
  return who ? `Hi ${who},` : "Hi there,";
}

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
  caseRow: { id: string; user_id: string; status: string },
  negotiation: Pick<AutomationNegotiation, "status">,
): Promise<CaseStatusSyncResult> {
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
