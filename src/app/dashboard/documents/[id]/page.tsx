import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { EMPTY_BILL_ANALYSIS, type BillAnalysis } from "@/lib/billAnalysis";
import DocumentAnalysisClient from "@/components/dashboard/DocumentAnalysisClient";
import { EMPTY_VALUE, HEADER_FIELD_DEFS, type HeaderField, type HeaderKey } from "@/lib/headerInfo";
import { isCaseCompleted } from "@/lib/caseStatus";
import { canRescan, rescanHint } from "@/lib/rescan";

export default async function DocumentAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: bill } = await supabase
    .from("bills")
    .select("id, filename, storage_url, status, provider_name, service_date, statement_date, analysis_result")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!bill) {
    notFound();
  }

  // An un-analysed bill falls back to an EMPTY analysis, not a mock one.
  // This used to be MOCK_BILL_ANALYSIS, so a customer opening a bill we had
  // not read was shown a fabricated record belonging to "Dave J. Collins".
  const analysis = (bill.analysis_result as BillAnalysis | null) ?? EMPTY_BILL_ANALYSIS;
  const [doc] = await getBillDocuments(supabase, [
    { id: bill.id, filename: bill.filename, storage_url: bill.storage_url, status: bill.status, uploaded_at: "" },
  ]);

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, status, errors_detected, appeal_letter_text, provider_email, letter_sent_at, rescanned_at, rescan_count")
    .eq("bill_id", bill.id)
    .maybeSingle();

  // Nothing on this page is locked behind the success fee any more.
  //
  // It used to null out previewUrl and downloadUrl once the analysis found
  // errors, so a customer who had paid the commitment fee could not open
  // the bill THEY uploaded. That is their own document; withholding it
  // teaches them we are holding their records hostage rather than that we
  // found something worth paying for.
  //
  // The analysis and the appeal letter were already visible and
  // watermarked, so this brings the bill itself into line with them.
  // Everything here is watermarked while the case is in progress -- see
  // `inProgress` below.
  //
  // What stays gated is the one thing the fee actually buys: the REVISED
  // bill. That is blurred on the Active Case screen and the engine refuses
  // to release the file with a 402 until the completion fee is paid, which
  // is enforcement rather than a hidden button.

  // Once the AI has actually analyzed the bill, show what it found (or an
  // honest "not found") and let the customer correct it. The sample
  // hospital/dates below are only the placeholder content shown before any
  // analysis exists, and that state isn't editable.
  const analyzed = Boolean(bill.analysis_result);
  const headerValues: Record<HeaderKey, string> = {
    memberName: analysis.memberName,
    memberId: analysis.memberId,
    group: analysis.group,
    claimNumber: analysis.claimNumber,
    providerName: bill.provider_name ?? (analyzed ? EMPTY_VALUE.providerName : "Crown Med Hospital Center"),
    accountNumber: analysis.accountNumber,
    serviceDate: bill.service_date ?? (analyzed ? EMPTY_VALUE.serviceDate : "2026-07-14"),
    statementDate: bill.statement_date ?? (analyzed ? EMPTY_VALUE.statementDate : "2026-07-14"),
  };
  const headerInfo: HeaderField[] = HEADER_FIELD_DEFS.map((def) => ({ ...def, value: headerValues[def.key] }));

  // Documents stay watermarked until the case is completed.
  const inProgress = Boolean(caseRow) && !isCaseCompleted(caseRow!.status);

  const appealLetter = caseRow
    ? {
        caseId: caseRow.id,
        text: caseRow.appeal_letter_text,
        providerEmail: caseRow.provider_email,
        sentAt: caseRow.letter_sent_at,
        watermark: inProgress ? "BillFixr" : null,
      }
    : null;

  return (
    <DocumentAnalysisClient
      analysis={analysis}
      headerInfo={headerInfo}
      doc={doc}
      appealLetter={appealLetter}
      headerEditBillId={analyzed ? bill.id : null}
      watermark={inProgress}
      caseId={caseRow?.id ?? null}
      canRescan={Boolean(caseRow) && canRescan(caseRow)}
      rescanHint={rescanHint(caseRow)}
    />
  );
}
