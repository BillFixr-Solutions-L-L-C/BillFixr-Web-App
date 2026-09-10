import UploadsTable, { type UploadRow } from "@/components/admin/UploadsTable";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { sanitizeSearchTerm, ADMIN_PAGE_SIZE } from "@/lib/searchFilter";
import AdminTableToolbar from "@/components/admin/AdminTableToolbar";
import Pagination from "@/components/admin/Pagination";

type BillWithProfile = {
  id: string;
  filename: string;
  storage_url: string | null;
  provider_name: string | null;
  status: string;
  uploaded_at: string;
  profiles: { name: string } | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "uploaded", label: "Uploaded" },
  { value: "scanning", label: "Scanning" },
  { value: "analyzed", label: "Analyzed" },
  { value: "error", label: "Error" },
];

export default async function AdminUploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  const search = q ? sanitizeSearchTerm(q) : "";

  let matchingUserIds: string[] | null = null;
  if (search) {
    const { data: matchingProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "customer")
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    matchingUserIds = (matchingProfiles ?? []).map((p) => p.id);
  }

  let query = supabase
    .from("bills")
    .select("id, filename, storage_url, provider_name, status, uploaded_at, profiles(name)", { count: "exact" });

  if (search) {
    // No customer matched the search at all — an empty `.in()` list would
    // otherwise be ignored by PostgREST and return everything, which is
    // the opposite of what an unmatched search should do.
    if (matchingUserIds!.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("user_id", matchingUserIds!);
    }
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data: bills, count } = await query
    .order("uploaded_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE));

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

  const { data: canDeleteBills } = await supabase.rpc("can_delete_bills");

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Uploads</h1>
      <AdminTableToolbar searchPlaceholder="Search by customer name or email" statusOptions={STATUS_OPTIONS} />
      <UploadsTable
        uploads={uploads}
        canDeleteBills={Boolean(canDeleteBills)}
        emptyMessage={search || (status && status !== "all") ? "No uploads match your search." : "No uploads yet."}
      />
      <Pagination page={page} totalPages={totalPages} />
    </div>
  );
}
