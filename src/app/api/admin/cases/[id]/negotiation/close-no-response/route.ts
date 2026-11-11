import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationEngineError, closeForNoResponse, getNegotiation } from "@/lib/automation-engine";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isBackendConfigured } from "@/lib/aiStack";
import { providerHasResponded } from "@/lib/negotiationStatus";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { emailCopy } from "@/lib/emailCopy";
import { customerLanguage } from "@/lib/language";
import { escapeHtml } from "@/lib/html";

// The ending for a case the provider never answered.
//
// Before this route existed there was none. The engine sent the dispute,
// then three 72-hour follow-ups, then stopped — and the case sat at
// `awaiting_response` indefinitely. The customer was told we were chasing,
// and nothing would ever say otherwise. For a hospital that simply ignores
// us, which is a normal outcome rather than an error, there was no way to
// finish and no way to hand them their documentation.
//
// The engine applies no guard of its own: POST /no-response/close closes
// whatever it is handed, whatever state it is in. So both conditions are
// checked here, against the engine's live view rather than our cached one:
//
//   1. the provider genuinely has not responded, and
//   2. all three follow-ups have actually gone out.
//
// Without (1) an admin could close a case mid-negotiation and we would tell
// the customer their provider ignored them when it had not. Without (2) we
// would give up early on a provider that was merely slow.
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
  // Same gate as approving a settlement: closing a case ends the client's
  // negotiation, so it needs full access to the negotiation domain rather
  // than merely an admin account.
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, status, negotiation_id")
    .eq("id", id)
    .single();
  if (!caseRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!caseRow.negotiation_id) {
    return NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 409 });
  }
  if (caseRow.status === "closed" || caseRow.status === "resolved" || caseRow.status === "paid") {
    return NextResponse.json({ error: "This case is already finished." }, { status: 409 });
  }

  // Read the body before anything else that can fail, but treat a missing
  // or unparseable one as "no reason given" rather than a bad request: the
  // reason is optional and the engine has its own default.
  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body?.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 1000);
    }
  } catch {
    reason = undefined;
  }

  let negotiation;
  try {
    negotiation = await getNegotiation(caseRow.negotiation_id);
  } catch (err) {
    console.error("Could not read the negotiation before closing case", id, err);
    return NextResponse.json(
      { error: "We couldn't reach the negotiation service. Please try again." },
      { status: 502 },
    );
  }

  if (providerHasResponded(negotiation.status)) {
    return NextResponse.json(
      {
        error: "This provider has responded, so the case can't be closed for non-response.",
        negotiationStatus: negotiation.status,
      },
      { status: 409 },
    );
  }

  const followUpsSent = Number(negotiation.cadence_step ?? 0);
  if (followUpsSent < 3) {
    return NextResponse.json(
      {
        error: `Only ${followUpsSent} of 3 follow-ups have been sent. Wait for the sequence to finish.`,
        followUpsSent,
      },
      { status: 409 },
    );
  }

  let closed;
  try {
    closed = await closeForNoResponse(caseRow.negotiation_id, reason);
  } catch (err) {
    if (err instanceof AutomationEngineError && err.status === 404) {
      return NextResponse.json({ error: "The negotiation service has no record of this case." }, { status: 409 });
    }
    console.error("Could not close case for no response", id, err);
    return NextResponse.json({ error: "We couldn't close the case. Please try again." }, { status: 502 });
  }

  // Written with the service role and conditional on the status we read, so
  // two admins clicking at once cannot both close it and both email the
  // customer. The second update matches no row.
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("cases")
    .update({ status: "closed" })
    .eq("id", caseRow.id)
    .eq("status", caseRow.status)
    .select("id");
  if (updateError) {
    // The engine has already closed its side. Failing here would leave the
    // two disagreeing with no way to retry, so this is reported loudly and
    // the engine's answer is still returned.
    console.error("Engine closed the negotiation but the case status did not update", id, updateError);
    return NextResponse.json(
      { error: "The negotiation was closed but the case status did not update. Please re-check this case." },
      { status: 500 },
    );
  }

  const alreadyClosed = !updated || updated.length === 0;

  // One email per case, because it is tied to the status transition
  // actually happening rather than to the request being made.
  let emailed = false;
  if (!alreadyClosed) {
    // communication_language, not the display cookie: what they chose on
    // their first visit is what we write to them in. See lib/language.ts.
    const { data: profile } = await admin
      .from("profiles")
      .select("name, email, communication_language")
      .eq("id", caseRow.user_id)
      .single();
    if (profile?.email) {
      try {
        const copy = emailCopy("closedNoResponse", customerLanguage(profile));
        await sendEmail({
          to: profile.email,
          subject: copy.subject,
          html: renderEmailCard({
            title: copy.heading,
            heading: copy.heading,
            bodyHtml: emailParagraph(escapeHtml(copy.body)),
            cta: { text: copy.cta, href: "https://billfixr.com/dashboard/case" },
          }),
        });
        emailed = true;
      } catch (err) {
        // The case is closed either way. Not telling them is worth a log
        // line, not an error on a completed action.
        console.error("Could not email the customer about the closure of case", id, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    alreadyClosed,
    emailed,
    followUpsSent,
    negotiation: closed,
  });
}

// Deliberately does not promise an outcome. The provider ignored us; what
// the customer has is the documented record, which is what they can use
// with the provider, an insurer or a regulator.
export const CLOSED_NO_RESPONSE_EMAIL = {
  subject: "Your case has been closed",
  heading: "Your provider didn't respond",
  body:
    "We sent your dispute and followed up three times, and your provider didn't reply. " +
    "We've closed the case and your full documented record is available from your dashboard — " +
    "the dispute we sent, every follow-up, and the dates they went out.",
};
