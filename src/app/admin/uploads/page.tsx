import UploadsTable, { type UploadRow } from "@/components/admin/UploadsTable";
import { createClient } from "@/lib/supabase/server";

type BillWithProfile = {
  id: string;
  filename: string;
  provider_name: string | null;
  status: string;
  uploaded_at: string;
  profiles: { name: string } | null;
};

export default async function AdminUploadsPage() {
  const supabase = await createClient();
  const { data: bills } = await supabase
    .from("bills")
    .select("id, filename, provider_name, status, uploaded_at, profiles(name)")
    .order("uploaded_at", { ascending: false });

  const uploads: UploadRow[] = ((bills ?? []) as unknown as BillWithProfile[]).map((b) => ({
    id: b.id,
    customer: b.profiles?.name ?? "Unknown",
    filename: b.filename,
    providerName: b.provider_name,
    status: b.status,
    uploadedAt: b.uploaded_at,
  }));

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Uploads</h1>
      <UploadsTable uploads={uploads} />
    </div>
  );
}
