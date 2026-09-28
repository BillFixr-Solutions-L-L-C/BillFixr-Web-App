import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { MOCK_BILL_ANALYSIS, type BillAnalysis } from "@/lib/billAnalysis";
import DocumentAnalysisClient from "@/components/dashboard/DocumentAnalysisClient";
import { EMPTY_VALUE, HEADER_FIELD_DEFS, type HeaderField, type HeaderKey } from "@/lib/headerInfo";

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

  const analysis = (bill.analysis_result as BillAnalysis | null) ?? MOCK_BILL_ANALYSIS;
  const [doc] = await getBillDocuments(supabase, [
    { id: bill.id, filename: bill.filename, storage_url: bill.storage_url, status: bill.status, uploaded_at: "" },
  ]);

  // Payment-gated document access: real enforcement that simply never
  // triggers today, since errors_detected is always null pre-Phase-2 —
  // it activates automatically once AI populates it, same shape as
  // everything else gated on Phase 2 in this codebase.
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, errors_detected, appeal_letter_text, provider_email, letter_sent_at")
    .eq("bill_id", bill.id)
    .maybeSingle();

  let locked = false;
  if (caseRow && (caseRow.errors_detected ?? 0) > 0) {
    const { data: paidSuccessFee } = await supabase
      .from("payment_records")
      .select("id")
      .eq("case_id", caseRow.id)
      .eq("type", "success_fee")
      .eq("status", "paid")
      .maybeSingle();
    locked = !paidSuccessFee;
  }
  if (locked) {
    doc.previewUrl = null;
    doc.downloadUrl = null;
  }

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

  const appealLetter = caseRow
    ? {
        caseId: caseRow.id,
        text: caseRow.appeal_letter_text,
        providerEmail: caseRow.provider_email,
        sentAt: caseRow.letter_sent_at,
      }
    : null;

  return (
    <DocumentAnalysisClient
      analysis={analysis}
      headerInfo={headerInfo}
      doc={doc}
      locked={locked}
      appealLetter={appealLetter}
      headerEditBillId={analyzed ? bill.id : null}
    />
  );
}
