import PageHeading from "@/components/dashboard/PageHeading";
import DocumentsTable, { type DocumentRow } from "@/components/dashboard/DocumentsTable";
import { createClient } from "@/lib/supabase/server";
import { buildCaseDocumentRows } from "@/lib/caseDocuments";

type CaseWithBill = {
  id: string;
  appeal_letter_text: string | null;
  letter_sent_at: string | null;
  created_at: string;
  bills: { id: string; filename: string; provider_name: string | null; analysis_result: unknown } | null;
};

// Lists what the process has produced for the customer — the analysis, the
// appeal letter, and anything staff have uploaded against the case. The
// bill they uploaded themselves is deliberately not listed here.
export default async function MyDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: DocumentRow[] = [];

  if (user) {
    const { data: cases } = await supabase
      .from("cases")
      .select("id, appeal_letter_text, letter_sent_at, created_at, bills(id, filename, provider_name, analysis_result)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const { data: stored } = await supabase
      .from("case_documents")
      .select("id, case_id, type, filename, storage_url, size_bytes, received_on, created_at")
      .eq("user_id", user.id);

    for (const c of (cases as unknown as CaseWithBill[]) ?? []) {
      const documents = await buildCaseDocumentRows(supabase, {
        bill: null, // the customer's own upload isn't listed here
        appealLetterText: c.appeal_letter_text,
        letterSentAt: c.letter_sent_at,
        hasAnalysis: Boolean(c.bills?.analysis_result),
        analysisDate: c.created_at,
        stored: (stored ?? []).filter((d) => d.case_id === c.id),
      });

      rows = rows.concat(
        documents
          .filter((d) => d.available)
          .map((d) => ({
            key: `${c.id}-${d.id}`,
            label: d.label,
            provider: c.bills?.provider_name ?? "—",
            date: d.date,
            previewUrl: d.previewUrl,
            // The analysis isn't a file — it's the page that renders it,
            // which is keyed on the bill.
            href: d.id === "analysis" && c.bills ? `/dashboard/documents/${c.bills.id}` : null,
          })),
      );
    }
  }

  return (
    <div>
      <PageHeading title="My Documents" />
      <DocumentsTable rows={rows} />
    </div>
  );
}
