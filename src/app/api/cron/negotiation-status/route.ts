import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCaseFromNegotiation } from "@/lib/caseStatusSync";
import { getNegotiation } from "@/lib/automation-engine";
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
  const failures: string[] = [];

  for (const caseRow of cases ?? []) {
    try {
      const negotiation = await getNegotiation(caseRow.negotiation_id as string);
      const result = await syncCaseFromNegotiation(admin, caseRow, negotiation);
      if (result.changed) advanced += 1;
    } catch (err) {
      // One unreachable negotiation must not stop the rest. The next run
      // retries it, since the case's status is unchanged.
      console.error("Negotiation status sync failed for case", caseRow.id, err);
      failures.push(caseRow.id);
    }
  }

  return NextResponse.json({ checked: cases?.length ?? 0, advanced, failed: failures.length });
}
