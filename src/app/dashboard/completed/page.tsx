import { createClient } from "@/lib/supabase/server";
import { COMPLETED_STATUSES } from "@/lib/caseStatus";
import PageHeading from "@/components/dashboard/PageHeading";
import CompletedCasesTable, { type CompletedCaseRow } from "@/components/dashboard/CompletedCasesTable";

export default async function CompletedCasesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("cases")
    .select("id, status, savings_found, letter_sent_at, bills(filename, provider_name, uploaded_at)")
    .eq("user_id", user!.id)
    .in("status", COMPLETED_STATUSES)
    .order("created_at", { ascending: false });

  const rows: CompletedCaseRow[] = ((data as unknown as RawRow[]) ?? []).map((c) => ({
    id: c.id,
    filename: c.bills?.filename ?? "Bill",
    provider: c.bills?.provider_name ?? "—",
    uploadedAt: c.bills?.uploaded_at ?? null,
    appealLetterSent: Boolean(c.letter_sent_at),
    savings: c.savings_found,
  }));

  return (
    <div>
      <PageHeading title="Completed Case" />
      <CompletedCasesTable rows={rows} />
    </div>
  );
}

type RawRow = {
  id: string;
  status: string;
  savings_found: number | null;
  letter_sent_at: string | null;
  bills: { filename: string; provider_name: string | null; uploaded_at: string } | null;
};
