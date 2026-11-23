import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { AiServiceTimeoutError, getAiServiceConfig, processCase } from "@/lib/ai-service";
import { mapAdminCaseAnalysis, mapBillAnalysis, mapCaseFields } from "@/lib/aiAnalysisMapping";
import {
  mapAdminCaseAnalysisFromEngine,
  mapBillAnalysisFromEngine,
  mapCaseFieldsFromEngine,
} from "@/lib/engineAnalysisMapping";
import { isEngineExtraction, storedBillData } from "@/lib/engineBillData";
import { auditBill, extractBill } from "@/lib/automation-engine";
import { guessContentType } from "@/lib/contentType";
import type { AiCaseProcessingResponse } from "@/types/ai";
import { MAX_RESCANS, canRescan, remaining, used } from "@/lib/rescan";

// Stands in for the real trigger (an automated pipeline kicking this off
// right after upload) the same way /api/dev/advance-case stands in for
// real status-changing events elsewhere — validates ownership, then does
// the actual privileged work with the service role. Calls the real
// billfixr-ai service (see services/ai-service/) to extract + audit the
// uploaded bill, then writes the result into the exact jsonb/scalar
// contract Step 8 already built (bills.analysis_result, cases.errors_detected/
// savings_found/appeal_letter_text/ai_summary_text/admin_analysis) — the
// frontend already reads these with a mock fallback, so no page changes
// are needed once real data lands here.
// Reading a bill is OCR plus a model call behind a free-tier cold start, so
// this needs minutes, not seconds. Stated explicitly rather than inherited:
// the platform default has changed before, differs by plan, and is not
// visible from the repo -- so a route that depends on it silently depends on
// a setting nobody here can read.
export const maxDuration = 300;

export async function POST(request: Request) {
  // `force` backs the Re-scan button: read the bill again and replace the
  // analysis, rather than returning the one already stored.
  const { caseId, force } = await request.json();
  if (typeof caseId !== "string" || (force !== undefined && typeof force !== "boolean")) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select(
      "id, user_id, bill_id, negotiation_id, rescanned_at, rescan_count, bills(id, filename, storage_url, analysis_result, provider_name, provider_email, provider_phone, provider_address)",
    )
    .eq("id", caseId)
    .single();
  const bill = Array.isArray(caseRow?.bills) ? caseRow.bills[0] : caseRow?.bills;
  if (!caseRow || !bill) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Normally the owner, and only the owner. The exception is an admin
  // restarting a case that stalled before it was ever analysed.
  //
  // Two paid cases were stranded that way on 2026-11-10/11: the scan
  // never ran, and nothing in the product could start it — the upload
  // screen's stage is client-only state that resets on reload, and the
  // admin "Retry" button was inert precisely because this check had no
  // way through it. The customer-side recovery added later only helps a
  // customer who opens the case again.
  //
  // An admin may START a scan that never happened. They may not `force`
  // one: that spends a re-scan from the customer's allowance of two, and
  // it is not the team's allowance to spend.
  const isOwner = caseRow.user_id === user.id;
  let actingAsAdmin = false;
  if (!isOwner) {
    const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    actingAsAdmin =
      caller?.role === "admin" && hasFullDomainAccess(await getDomainAccess(supabase, "ai_pipeline"));
    if (!actingAsAdmin) {
      // Same answer as a case that does not exist: an id that is not
      // yours should not be distinguishable from one that is not there.
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (force) {
      return NextResponse.json(
        { error: "A re-scan spends the customer's allowance. Start the analysis instead." },
        { status: 403 },
      );
    }
  }
  if (!bill.storage_url) {
    return NextResponse.json({ error: "bill has no stored file" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotent: already analyzed, don't re-call the AI service or
  // overwrite an existing result — unless this is an explicit re-scan.
  if (bill.analysis_result && !force) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  // One re-scan per case: it's a free second AI read, meant as a one-off
  // correction when the first result looks wrong.
  // The allowance is a count now, not "has it ever been re-scanned". Two,
  // so there is a second look available at the point it is wanted: after
  // reading the analysis and the appeal letter together, before Proceed.
  // See src/lib/rescan.ts.
  if (force && !canRescan(caseRow)) {
    return NextResponse.json(
      {
        error: `You've used all ${MAX_RESCANS} re-scans for this bill. Contact support if it still looks wrong.`,
        rescansRemaining: 0,
      },
      { status: 409 },
    );
  }

  // Checked after the case itself: "you've already re-scanned" is the more
  // specific answer, and shouldn't be masked by a configuration problem on
  // our side.
  // Deliberately NOT checked yet: a bill the engine has already read does
  // not need the ai-service at all, and refusing here would block the
  // path that no longer uses it. The check moved to the branch that does.

  // The information step already had the AI read this document to fill in
  // the hospital details; that whole response was parked in
  // bill_extractions. Reuse it rather than paying for a second reading —
  // this is where the parts held back until payment get written out.
  // A re-scan has to actually re-read the document.
  //
  // It used to do that by DELETING the stored reading first and then
  // falling through to the ai-service, and both halves of that were
  // wrong. The delete happened before the new reading existed, so a
  // re-scan that failed left the case with no reading at all -- and
  // because nothing else writes engine_result except the information
  // step, the only thing left to re-read with was the ai-service, which
  // the engine was brought in to replace. One press of Re-scan on a
  // working case turned it into "This bill hasn't been read yet" and no
  // way to proceed. Reported from a real run on 2026-11-22.
  //
  // Nobody could press Re-scan until 2026-11-18, which is why this sat
  // here harmlessly until the button became reachable.
  //
  // So: re-read with the engine, and only replace the stored reading once
  // the new one is in hand.
  let { data: cached } = await admin
    .from("bill_extractions")
    .select("engine_result, result")
    .eq("bill_id", bill.id)
    .maybeSingle();

  if (force) {
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from("bills")
      .download(bill.storage_url);
    if (downloadError || !fileBlob) {
      console.error("bill download failed for re-scan of case", caseId, downloadError);
      return NextResponse.json(
        { error: "We couldn't load your bill to read it again. Please try again.", stage: "bill_download" },
        { status: 500 },
      );
    }
    try {
      const reread = await extractBill({
        filename: bill.filename,
        bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
      });
      if (!isEngineExtraction(reread)) {
        // A 200 carrying something that is not a reading is a failure,
        // and the old reading is still the better of the two.
        console.error("Re-scan returned no usable reading for bill", bill.id);
        return NextResponse.json(
          { error: "We read your bill again but couldn't make sense of it. Your previous reading is unchanged.", stage: "extract_empty" },
          { status: 502 },
        );
      }
      await admin
        .from("bill_extractions")
        .upsert({ bill_id: bill.id, engine_result: reread }, { onConflict: "bill_id" });
      cached = { engine_result: reread, result: cached?.result ?? null };
    } catch (err) {
      // The old reading is left exactly as it was. The customer has spent
      // one of their allowance, which is the only thing lost.
      console.error("Re-scan failed for bill", bill.id, err);
      return NextResponse.json(
        { error: "We couldn't read your bill again just now. Your previous reading is unchanged.", stage: "rescan_failed" },
        { status: 502 },
      );
    }
  }

  // The engine's own reading is preferred, and it is already there: the
  // information step wrote it when it read the bill for the form. This
  // used to select only `result` -- the ai-service's shape, which the
  // information step stopped writing -- so it always missed, downloaded
  // the file again, and read every bill a second time through the weaker
  // service. See src/lib/engineAnalysisMapping.ts.
  const engineBillData = storedBillData(cached);
  const usingEngine = Boolean(cached?.engine_result) && engineBillData !== null;

  let result = cached?.result as AiCaseProcessingResponse | undefined;

  if (!usingEngine && !result) {
    if (!getAiServiceConfig()) {
      return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });
    }
    const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
    if (downloadError || !fileBlob) {
      console.error("bill download failed for case", caseId, downloadError);
      return NextResponse.json(
        { error: "failed to load the stored bill file", stage: "bill_download" },
        { status: 500 },
      );
    }
    try {
      result = await processCase(caseId, {
        filename: bill.filename,
        bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
      });
    } catch (err) {
      console.error("AI service processing failed for case", caseId, err);
      // A timeout and a refusal are different problems with different
      // fixes, and until now both arrived as the same 502 with the same
      // sentence. `stage` is a fixed label, never the upstream error text,
      // which can carry connection details.
      if (err instanceof AiServiceTimeoutError) {
        return NextResponse.json(
          {
            error: "Analyzing this bill took too long and was stopped. Please try again.",
            stage: "ai_timeout",
          },
          { status: 504 },
        );
      }
      return NextResponse.json({ error: "AI processing failed", stage: "ai_processing" }, { status: 502 });
    }
    await admin.from("bill_extractions").upsert({ bill_id: bill.id, result });
  }

  let billAnalysis;
  let errorsDetected: number;
  let savingsFound: number;
  let appealLetterText: string | null;
  let aiSummaryText: string;
  let adminAnalysis;
  // Only the ai-service path has these to contribute; the engine's
  // extraction already filled them on the information step.
  let billFields: Record<string, unknown> = {};

  if (usingEngine && engineBillData) {
    // Audited by the engine, from the reading the engine already made.
    // The savings quoted to the customer and the engine's own settlement
    // offer are now two views of one `settlement_options` -- they used to
    // be unrelated numbers that disagreed on the same bill.
    let audit;
    try {
      audit = await auditBill(engineBillData);
    } catch (err) {
      console.error("Engine audit failed for case", caseId, err);
      return NextResponse.json({ error: "We couldn't audit this bill.", stage: "engine_audit" }, { status: 502 });
    }
    billAnalysis = mapBillAnalysisFromEngine(engineBillData, audit);
    ({ errorsDetected, savingsFound, appealLetterText, aiSummaryText } = mapCaseFieldsFromEngine(audit, null));
    adminAnalysis = mapAdminCaseAnalysisFromEngine(engineBillData, audit, null);
  } else {
    const extraction = result?.processed_documents?.[0]?.extraction;
    if (!extraction) {
      console.error("AI service returned no extraction for case", caseId);
      return NextResponse.json(
        { error: "AI service returned no extraction", stage: "ai_no_extraction" },
        { status: 502 },
      );
    }
    billAnalysis = mapBillAnalysis(extraction, result!.analysis);
    ({ errorsDetected, savingsFound, appealLetterText, aiSummaryText } = mapCaseFields(result!.analysis, result!.draft));
    adminAnalysis = mapAdminCaseAnalysis(extraction, result!.analysis, result!.draft);
    billFields = {
      service_date: extraction.date_of_service_start,
      statement_date: extraction.statement_date,
      // Fills the Hospital Information step. The customer can edit these
      // before analysis runs, so anything they already entered wins — the
      // AI only fills what is still blank.
      provider_name: bill.provider_name ?? extraction.provider.name,
      provider_email: bill.provider_email ?? extraction.provider.email,
      provider_phone: bill.provider_phone ?? extraction.provider.phone,
      provider_address: bill.provider_address ?? extraction.provider.address,
    };
  }

  const { error: billUpdateError } = await admin
    .from("bills")
    .update({ analysis_result: billAnalysis, ...billFields })
    .eq("id", bill.id);
  if (billUpdateError) {
    return NextResponse.json({ error: billUpdateError.message }, { status: 500 });
  }

  const { error: caseUpdateError } = await admin
    .from("cases")
    .update({
      errors_detected: errorsDetected,
      savings_found: savingsFound,
      appeal_letter_text: appealLetterText,
      ai_summary_text: aiSummaryText,
      admin_analysis: adminAnalysis,
      // Spends one of the allowance. rescanned_at still records WHEN the
      // most recent one happened -- the admin case view reads it, and a
      // bare count cannot be audited against anything.
      ...(force
        ? {
            rescanned_at: new Date().toISOString(),
            rescan_count: used(caseRow) + 1,
          }
        : {}),
    })
    .eq("id", caseId);
  if (caseUpdateError) {
    return NextResponse.json({ error: caseUpdateError.message }, { status: 500 });
  }

  // The scan deliberately stops here, with the bill read and nothing
  // sent.
  //
  // It used to start the negotiation in this same request, which meant
  // the engine's first letter reached the provider before the customer
  // had seen a single finding. That also made the Re-scan and Proceed
  // buttons on the analysis page unreachable: they show only while the
  // case has no negotiation_id and no letter_sent_at, and this request
  // wrote both the moment the analysis existed. Segun asked for the
  // re-scan on 2026-11-18 and it had never once been possible to see it.
  //
  // The negotiation now starts from POST /api/dashboard/cases/[id]/
  // negotiation, which is what Proceed calls. That route shares
  // src/lib/startNegotiation.ts with this one's old path, so the
  // preconditions cannot drift.

  return NextResponse.json({
    ok: true,
    errorsDetected,
    savingsFound,
    rescansRemaining: remaining({ rescan_count: used(caseRow) + (force ? 1 : 0) }),
  });
}

