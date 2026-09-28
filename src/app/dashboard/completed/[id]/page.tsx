import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCaseCompleted } from "@/lib/caseStatus";
import { buildCaseDocumentRows } from "@/lib/caseDocuments";
import PageHeading from "@/components/dashboard/PageHeading";
import CaseDocumentList from "@/components/dashboard/CaseDocumentList";

export default async function CompletedCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: caseRow } = await supabase
    .from("cases")
    .select(
      "id, status, errors_detected, savings_found, appeal_letter_text, letter_sent_at, created_at, bills(filename, storage_url, uploaded_at, analysis_result)",
    )
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!caseRow || !isCaseCompleted(caseRow.status)) {
    notFound();
  }

  const bill = caseRow.bills as unknown as
    | { filename: string; storage_url: string | null; uploaded_at: string; analysis_result: unknown }
    | null;

  const { data: stored } = await supabase
    .from("case_documents")
    .select("id, type, filename, storage_url, size_bytes, received_on, created_at")
    .eq("case_id", id);

  const documents = await buildCaseDocumentRows(supabase, {
    bill: bill ? { filename: bill.filename, storage_url: bill.storage_url, uploaded_at: bill.uploaded_at } : null,
    appealLetterText: caseRow.appeal_letter_text,
    letterSentAt: caseRow.letter_sent_at,
    hasAnalysis: Boolean(bill?.analysis_result),
    analysisDate: caseRow.created_at,
    stored: stored ?? [],
  });

  const stats = [
    { label: "Bill Analyzed", value: bill?.analysis_result ? "1" : "0" },
    {
      label: "Savings Found",
      value:
        caseRow.savings_found == null
          ? "—"
          : Number(caseRow.savings_found).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }),
    },
    { label: "Errors Detected", value: caseRow.errors_detected == null ? "—" : String(caseRow.errors_detected) },
    { label: "Appeal Generated", value: caseRow.appeal_letter_text ? "1" : "0" },
  ];

  return (
    <div>
      <Link
        href="/dashboard/completed"
        className="mb-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        ← Back to completed cases
      </Link>
      <PageHeading title="Completed Case" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <CaseDocumentList documents={documents} />
    </div>
  );
}
