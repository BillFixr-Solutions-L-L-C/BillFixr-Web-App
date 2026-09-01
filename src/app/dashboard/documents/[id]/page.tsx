import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { MOCK_BILL_ANALYSIS, type BillAnalysis } from "@/lib/billAnalysis";
import DocumentAnalysisClient from "@/components/dashboard/DocumentAnalysisClient";

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

  const headerInfo = [
    { label: "Member name", value: analysis.memberName },
    { label: "Member ID", value: analysis.memberId },
    { label: "Group", value: analysis.group },
    { label: "Claim number", value: analysis.claimNumber },
    { label: "Provider name", value: bill.provider_name ?? "Crown Med Hospital Center" },
    { label: "Account number", value: analysis.accountNumber },
    { label: "Date of service", value: bill.service_date ?? "2026-07-14" },
    { label: "Statement date", value: bill.statement_date ?? "2026-07-14" },
  ];

  return <DocumentAnalysisClient analysis={analysis} headerInfo={headerInfo} doc={doc} />;
}
