import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiServiceConfig, processCase } from "@/lib/ai-service";
import { mapAdminCaseAnalysis, mapBillAnalysis, mapCaseFields } from "@/lib/aiAnalysisMapping";
import { guessContentType } from "@/lib/contentType";
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
export async function POST(request: Request) {
  // `force` backs the Re-scan button: read the bill again and replace the
  // analysis, rather than returning the one already stored.
  const { caseId, force } = await request.json();
  if (typeof caseId !== "string" || (force !== undefined && typeof force !== "boolean")) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!getAiServiceConfig()) {
    return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });
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
      "id, user_id, bill_id, rescanned_at, bills(id, filename, storage_url, analysis_result, provider_name, provider_email, provider_phone, provider_address)",
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

  // Idempotent: already analyzed, don't re-call the AI service or
  // overwrite an existing result — unless this is an explicit re-scan.
  if (bill.analysis_result && !force) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  // One re-scan per case: it's a free second AI read, meant as a one-off
  // correction when the first result looks wrong.
  if (force && caseRow.rescanned_at) {
    return NextResponse.json(
      { error: "You've already re-scanned this bill. Contact support if it still looks wrong." },
      { status: 409 },
    );
  }

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
    : await admin.from("bill_extractions").select("result").eq("bill_id", bill.id).maybeSingle();

  let result = cached?.result as AiCaseProcessingResponse | undefined;

  if (!result) {
    const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
    if (downloadError || !fileBlob) {
      return NextResponse.json({ error: "failed to load the stored bill file" }, { status: 500 });
    }
    try {
      result = await processCase(caseId, {
        filename: bill.filename,
        bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
      });
    } catch (err) {
      console.error("AI service processing failed for case", caseId, err);
      return NextResponse.json({ error: "AI processing failed" }, { status: 502 });
    }
    await admin.from("bill_extractions").upsert({ bill_id: bill.id, result });
  }

  const extraction = result.processed_documents[0]?.extraction;
  if (!extraction) {
    return NextResponse.json({ error: "AI service returned no extraction" }, { status: 502 });
  }

  const billAnalysis = mapBillAnalysis(extraction, result.analysis);
  const { errorsDetected, savingsFound, appealLetterText, aiSummaryText } = mapCaseFields(result.analysis, result.draft);
  const adminAnalysis = mapAdminCaseAnalysis(extraction, result.analysis, result.draft);

  const { error: billUpdateError } = await admin
    .from("bills")
    .update({
      analysis_result: billAnalysis,
      service_date: extraction.date_of_service_start,
      statement_date: extraction.statement_date,
      // Fills the Hospital Information step. The customer can edit these
      // before analysis runs, so anything they already entered wins — the
      // AI only fills what is still blank.
      provider_name: bill.provider_name ?? extraction.provider.name,
      provider_email: bill.provider_email ?? extraction.provider.email,
      provider_phone: bill.provider_phone ?? extraction.provider.phone,
      provider_address: bill.provider_address ?? extraction.provider.address,
    })
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

  return NextResponse.json({ ok: true, errorsDetected, savingsFound });
}
