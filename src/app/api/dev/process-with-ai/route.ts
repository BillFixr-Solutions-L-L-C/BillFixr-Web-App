import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiServiceConfig, processCase } from "@/lib/ai-service";
import { mapAdminCaseAnalysis, mapBillAnalysis, mapCaseFields } from "@/lib/aiAnalysisMapping";

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

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
  const { caseId } = await request.json();
  if (typeof caseId !== "string") {
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
    .select("id, user_id, bill_id, bills(id, filename, storage_url, analysis_result)")
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
  // overwrite an existing result.
  if (bill.analysis_result) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "failed to load the stored bill file" }, { status: 500 });
  }

  let result;
  try {
    result = await processCase(caseId, {
      filename: bill.filename,
      bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
    });
  } catch (err) {
    console.error("AI service processing failed for case", caseId, err);
    return NextResponse.json({ error: "AI processing failed" }, { status: 502 });
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
      provider_name: extraction.provider.name,
      service_date: extraction.date_of_service_start,
      statement_date: extraction.statement_date,
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
    })
    .eq("id", caseId);
  if (caseUpdateError) {
    return NextResponse.json({ error: caseUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, errorsDetected, savingsFound });
}
