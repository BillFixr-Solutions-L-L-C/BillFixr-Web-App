import PageHeading from "@/components/dashboard/PageHeading";
import DocumentsTable, { type DocumentRow } from "@/components/dashboard/DocumentsTable";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { getT } from "@/lib/i18n/server";

// My Documents is the customer's own uploads: the hospital bills they gave
// us, nothing else.
//
// It used to list what the process produced for them instead — the
// analysis, the appeal letter, and anything received from the provider —
// with the uploaded bill deliberately left out. That is backwards. Those
// documents belong to a case, and the case screen is where they are read:
// Active Case lists all of them against the case they concern, so a
// customer with two cases can tell which analysis is which. Listed here
// they were a flat pile with no case to anchor them to.
//
// Keeping the bill here also means it is reachable before any case exists
// — between upload and the analysis there is nothing else to see.
export default async function MyDocumentsPage() {
  const t = await getT();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: DocumentRow[] = [];

  if (user) {
    const { data: bills } = await supabase
      .from("bills")
      .select("id, filename, provider_name, storage_url, status, uploaded_at")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    const signed = await getBillDocuments(supabase, bills ?? []);
    const byId = new Map(signed.map((d) => [d.id, d]));

    rows = (bills ?? []).map((bill) => ({
      key: bill.id,
      // Named for what it is, with the filename underneath. A row labelled
      // "Screen Shot 2026-10-23 at 5.40.05 PM.png" reads as a stray
      // upload rather than the medical bill the case is about — the same
      // reason the case document list carries both.
      label: t("docs.hospitalBill"),
      sublabel: bill.filename,
      provider: bill.provider_name ?? "—",
      date: bill.uploaded_at,
      previewUrl: byId.get(bill.id)?.previewUrl ?? null,
      // Nothing to navigate to: this is a file, and it opens over the
      // page. The analysis of it is read from the case.
      href: null,
    }));
  }

  return (
    <div>
      <PageHeading title={t("docs.title")} />
      <DocumentsTable rows={rows} />
    </div>
  );
}
