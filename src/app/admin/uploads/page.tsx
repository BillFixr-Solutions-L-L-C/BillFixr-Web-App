import UploadsTable, { type UploadRow } from "@/components/admin/UploadsTable";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";

type BillWithProfile = {
  id: string;
  filename: string;
  storage_url: string | null;
  provider_name: string | null;
  status: string;
  uploaded_at: string;
  profiles: { name: string } | null;
};

export default async function AdminUploadsPage() {
  const supabase = await createClient();
  const { data: bills } = await supabase
    .from("bills")
    .select("id, filename, storage_url, provider_name, status, uploaded_at, profiles(name)")
    .order("uploaded_at", { ascending: false });

  const billRows = (bills ?? []) as unknown as BillWithProfile[];
  const documents = await getBillDocuments(supabase, billRows);
  const documentById = new Map(documents.map((doc) => [doc.id, doc]));

  const uploads: UploadRow[] = billRows.map((b) => ({
    id: b.id,
    customer: b.profiles?.name ?? "Unknown",
    filename: b.filename,
    providerName: b.provider_name,
    status: b.status,
    uploadedAt: b.uploaded_at,
    doc: documentById.get(b.id) ?? null,
  }));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Uploads</h1>
      <UploadsTable uploads={uploads} />
    </div>
  );
}
