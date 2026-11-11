import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiServiceTimeoutError, getAiServiceConfig, processCase } from "@/lib/ai-service";
import { mapAdminCaseAnalysis, mapBillAnalysis, mapCaseFields } from "@/lib/aiAnalysisMapping";
import {
  mapAdminCaseAnalysisFromEngine,
  mapBillAnalysisFromEngine,
  mapCaseFieldsFromEngine,
} from "@/lib/engineAnalysisMapping";
import { storedBillData } from "@/lib/engineBillData";
import { auditBill, getNegotiation } from "@/lib/automation-engine";
import { guessContentType } from "@/lib/contentType";
import { negotiationSummary, startNegotiationForCase, type StartableCase } from "@/lib/startNegotiation";
import type { AiCaseProcessingResponse } from "@/types/ai";

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
      "id, user_id, bill_id, negotiation_id, rescanned_at, bills(id, filename, storage_url, analysis_result, provider_name, provider_email, provider_phone, provider_address)",
    )
    .eq("id", caseId)
    .single();
  const bill = Array.isArray(caseRow?.bills) ? caseRow.bills[0] : caseRow?.bills;
  if (!caseRow || caseRow.user_id !== user.id || !bill) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!bill.storage_url) {
    return NextResponse.json({ error: "bill has no stored file" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Exactly the three fields the start reads, and bill_id taken from the
  // joined bill rather than the case column so a case row whose bill_id
  // is null still resolves to the right bill.
  const startable: StartableCase = {
    id: caseRow.id,
    bill_id: bill.id,
    negotiation_id: caseRow.negotiation_id,
  };

  // Idempotent: already analyzed, don't re-call the AI service or
  // overwrite an existing result — unless this is an explicit re-scan.
  if (bill.analysis_result && !force) {
    // Still offered a negotiation: a case analyzed before the engine was
    // wired in has an analysis and no negotiation, and this is the only
    // way to start one without paying for a second AI read.
    const negotiation = await beginNegotiation(admin, startable);
    return NextResponse.json({ ok: true, alreadyProcessed: true, negotiation });
  }

  // One re-scan per case: it's a free second AI read, meant as a one-off
  // correction when the first result looks wrong.
  if (force && caseRow.rescanned_at) {
    return NextResponse.json(
      { error: "You've already re-scanned this bill. Contact support if it still looks wrong." },
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
  // A re-scan has to actually re-read the document, so the stored reading
  // is dropped rather than reused.
  if (force) {
    await admin.from("bill_extractions").delete().eq("bill_id", bill.id);
  }

  const { data: cached } = force
    ? { data: null }
    : await admin
        .from("bill_extractions")
        .select("engine_result, result")
        .eq("bill_id", bill.id)
        .maybeSingle();

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
      // Spends the single re-scan, so a second one is refused.
      ...(force ? { rescanned_at: new Date().toISOString() } : {}),
    })
    .eq("id", caseId);
  if (caseUpdateError) {
    return NextResponse.json({ error: caseUpdateError.message }, { status: 500 });
  }

  // The scan is where a negotiation can finally start: the commitment
  // fee bought the case, and the extraction this route just wrote is the
  // bill data the engine audits. Before this, nothing in the app ever
  // started one — the route that could was never called, and the case
  // was moved to "awaiting_response" by the client asking for it, with
  // no letter behind the claim.
  const negotiation = await beginNegotiation(admin, startable);

  // On the engine path the appeal letter is not a separate draft: the
  // engine writes it and sends it as part of starting, so the stored
  // letter is read back from the negotiation afterwards. That makes
  // cases.appeal_letter_text the text the provider actually received,
  // rather than a second draft nobody sent.
  if (usingEngine && negotiation?.running) {
    const { data: linked } = await admin.from("cases").select("negotiation_id").eq("id", caseId).maybeSingle();
    if (linked?.negotiation_id) {
      try {
        const sent = await getNegotiation(linked.negotiation_id);
        const letter = (sent.messages ?? []).find(
          (m) => m.direction === "OUTBOUND" && m.content_markdown,
        )?.content_markdown;
        if (letter) {
          appealLetterText = letter;
          await admin.from("cases").update({ appeal_letter_text: letter }).eq("id", caseId);
        }
      } catch (err) {
        // The letter went out either way; not having a copy of it stored
        // is worth a log line, not a failed scan.
        console.error("Could not store the sent letter for case", caseId, err);
      }
    }
  }

  return NextResponse.json({ ok: true, errorsDetected, savingsFound, negotiation });
}

// The engine writes to a real hospital here, so this never throws into
// the scan: the analysis above is already saved and worth returning even
// when the negotiation could not start. The outcome is handed back so the
// customer is told a letter went out only when one actually did.
async function beginNegotiation(admin: ReturnType<typeof createAdminClient>, caseRow: StartableCase) {
  try {
    const result = await startNegotiationForCase(admin, caseRow);
    const summary = negotiationSummary(result);
    if (!summary.running) {
      // Logged with the reason: "blocked" states are recoverable through
      // POST /api/dashboard/cases/[id]/negotiation once the missing piece
      // is in place, and a link_lost carries a live negotiation id that
      // must not disappear.
      const cause = result.started || "blocked" in result ? "" : result.cause;
      console.error("No negotiation running for case", caseRow.id, summary.reason, cause);
    }
    return summary;
  } catch (err) {
    console.error("Could not start a negotiation for case", caseRow.id, err);
    return { running: false, reason: "engine_refused" };
  }
}
