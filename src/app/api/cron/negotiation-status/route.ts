import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCaseFromNegotiation } from "@/lib/caseStatusSync";
import { getNegotiation, syncEngineInbox, tickFollowUpCadence } from "@/lib/automation-engine";
import { followUpDecision } from "@/lib/followUpCadence";
import { isBackendConfigured } from "@/lib/aiStack";

// Vercel Cron hits this on a schedule (see vercel.json). Asks the engine
// where each running negotiation stands and advances the case when the
// provider has replied.
//
// The per-case negotiation GET reconciles a case when someone opens it;
// this covers the ones nobody opens, so the "Your provider responded"
// email does not wait on the customer happening to visit.
//
// Daily, not hourly: the Vercel account is on Hobby, which rejects any
// cron expression that would run more than once a day (a deploy with
// `0 */4 * * *` was refused outright). Reconcile-on-read carries the
// common case -- a customer who opens their case sees the truth
// immediately -- so the sweep is the backstop, not the main path.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isBackendConfigured("automation-engine")) {
    // Not an error: before the engine is wired there is nothing to ask.
    return NextResponse.json({ skipped: "automation engine is not configured" });
  }

  const admin = createAdminClient();

  // FIRST, before reading any negotiation: make the engine read its
  // mailbox.
  //
  // Both of the engine's background loops -- the IMAP poller and the
  // autopilot -- are in-process tasks started at startup, and Render's free
  // tier kills them when it spins the service down after ~15 minutes idle.
  // This request is usually what wakes the engine at all, so without an
  // explicit sync the negotiations below are read from before whatever
  // arrived overnight.
  //
  // The ordering is the point, not an optimisation: a reply that landed
  // yesterday has to be seen before this run decides to chase the provider
  // again. Getting this backwards means sending a follow-up to a hospital
  // that already answered.
  //
  // Best-effort. A mailbox we cannot read is not a reason to skip the
  // status sweep, which is this route's original job.
  let inboxMessages: number | null = null;
  let inboxError = false;
  try {
    const synced = await syncEngineInbox();
    inboxMessages = Number(synced?.new_messages_processed ?? 0);
  } catch (err) {
    console.error("Could not make the engine sync its inbox", err);
    inboxError = true;
  }

  // Only cases the engine is actually running, and only those still short
  // of the response. A case already at response_received or beyond has
  // nothing to learn from this.
  const { data: cases, error } = await admin
    .from("cases")
    .select("id, user_id, status, negotiation_id")
    .not("negotiation_id", "is", null)
    .in("status", ["uploaded", "scanning", "analyzed", "letter_sent", "awaiting_response"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let advanced = 0;
  let followedUp = 0;
  const failures: string[] = [];

  for (const caseRow of cases ?? []) {
    try {
      const negotiation = await getNegotiation(caseRow.negotiation_id as string);
      const result = await syncCaseFromNegotiation(admin, caseRow, negotiation);
      if (result.changed) {
        // The provider has replied, so this case is not owed a chase. Moving
        // on also means the decision below never runs against a negotiation
        // we have just learned is answered.
        advanced += 1;
        continue;
      }

      // The 72-hour follow-up. The engine's tick endpoint does not check the
      // clock -- only its internal autopilot loop does -- so the gap is
      // decided here or not at all. See src/lib/followUpCadence.ts.
      const decision = followUpDecision(negotiation);
      if (decision.due) {
        const ticked = await tickFollowUpCadence(caseRow.negotiation_id as string);
        // The engine answers `needs_review` when a finding below `high`
        // confidence is holding the case, and sends nothing. That is a
        // correct outcome, not a follow-up, so it is not counted as one.
        if (ticked?.status === "success" || ticked?.action) followedUp += 1;
      }
    } catch (err) {
      // One unreachable negotiation must not stop the rest. The next run
      // retries it, since the case's status is unchanged.
      console.error("Negotiation status sync failed for case", caseRow.id, err);
      failures.push(caseRow.id);
    }
  }

  return NextResponse.json({
    checked: cases?.length ?? 0,
    advanced,
    followedUp,
    inboxMessages,
    inboxError,
    failed: failures.length,
  });
}
