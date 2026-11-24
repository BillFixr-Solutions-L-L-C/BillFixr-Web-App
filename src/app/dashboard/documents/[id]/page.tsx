import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import { getBillDocuments } from "@/lib/billDocuments";
import { EMPTY_BILL_ANALYSIS, type BillAnalysis } from "@/lib/billAnalysis";
import DocumentAnalysisClient from "@/components/dashboard/DocumentAnalysisClient";
import { EMPTY_VALUE, HEADER_FIELD_DEFS, type HeaderField, type HeaderKey } from "@/lib/headerInfo";
import { isCaseCompleted } from "@/lib/caseStatus";
import { canRescan, remaining, rescanHintKey } from "@/lib/rescan";
import { getT } from "@/lib/i18n/server";

export default async function DocumentAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const COLUMNS =
    "id, user_id, filename, storage_url, status, provider_name, service_date, statement_date, analysis_result";

  let { data: bill } = await supabase.from("bills").select(COLUMNS).eq("id", id).eq("user_id", user!.id).single();

  // Staff reading a customer's analysis.
  //
  // The admin case screen lists an "Analysis Generated" row, and until now
  // that row had nowhere to go: this page was scoped to the owner, so an
  // admin following it got a 404 and the team could see that an analysis
  // existed without being able to read it. Reported 2026-11-24.
  //
  // Gated on the same client_data access every other admin view of a
  // customer's documents uses, and read with the service role because the
  // customer's own RLS policy is what refused the first read. Nothing is
  // written here, and the decision-point buttons are withheld below:
  // Re-scan spends the customer's allowance and Proceed writes to their
  // provider, and neither is staff's to press.
  const viewingAsStaff = !bill;
  if (viewingAsStaff) {
    if (!hasDomainAccess(await getDomainAccess(supabase, "client_data"))) {
      notFound();
    }
    const { data: asStaff } = await createAdminClient().from("bills").select(COLUMNS).eq("id", id).single();
    bill = asStaff;
  }

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

  const CASE_COLUMNS =
    "id, status, errors_detected, appeal_letter_text, provider_email, letter_sent_at, negotiation_id, rescanned_at, rescan_count";
  // Read with whichever client could see the bill: the customer's own
  // policy refuses a case that is not theirs, and staff got here only by
  // passing the client_data check above.
  const reader = viewingAsStaff ? createAdminClient() : supabase;
  const { data: caseRow } = await reader
    .from("cases")
    .select(CASE_COLUMNS)
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

  // Re-scan and Proceed belong to one stretch of the process, and the
  // line is whether the dispute has left the building.
  //
  // Once the appeal letter is with the provider, re-reading the bill
  // would replace the analysis that letter was written from -- the
  // provider would be arguing about findings we no longer hold -- and
  // "Proceed" past the point the case is already proceeding reads as a
  // step the customer still has to take. Asked for on 2026-11-13: "By
  // the time they are opening the Analysis on the active case it
  // shouldn't show rescan or proceed."
  //
  // Not the commitment fee, which is the other candidate and the wrong
  // one: it is paid BEFORE the bill is read, so "analysis exists and the
  // fee is unpaid" is a state that never occurs and would hide the
  // buttons everywhere, for the wrong reason.
  //
  // `negotiation_id` as well as `letter_sent_at`: a negotiation that
  // started but whose send is not recorded yet is still a dispute in
  // flight.
  // Never for staff. Re-scan spends the customer's allowance and Proceed
  // writes to their provider; both are the customer's to press, on their
  // own case.
  const atDecisionPoint =
    !viewingAsStaff && Boolean(caseRow) && !caseRow!.letter_sent_at && !caseRow!.negotiation_id;

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
      rescanHint={t(rescanHintKey(caseRow), { count: remaining(caseRow) })}
      atDecisionPoint={atDecisionPoint}
    />
  );
}
