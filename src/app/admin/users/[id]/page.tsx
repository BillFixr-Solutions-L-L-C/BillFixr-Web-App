import { notFound } from "next/navigation";
import AccountActions from "@/components/admin/AccountActions";
import PromoteToAdmin from "@/components/admin/PromoteToAdmin";
import BillDocumentCard from "@/components/admin/BillDocumentCard";
import PendingDocumentCard from "@/components/admin/PendingDocumentCard";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        type="text"
        defaultValue={value}
        readOnly
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
      />
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, status, created_at")
    .eq("id", id)
    .eq("role", "customer")
    .single();

  if (!profile) {
    notFound();
  }

  const { data: billRows } = await supabase
    .from("bills")
    .select("id, filename, storage_url, status, uploaded_at")
    .eq("user_id", id)
    .order("uploaded_at", { ascending: false });
  const bills = await getBillDocuments(supabase, billRows ?? []);
  const billsCount = bills.length;

  const { count: casesCount } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", id);

  const { data: canDelete } = await supabase.rpc("can_delete_accounts");
  const { data: roles } = await supabase.from("roles").select("id, name").order("name");

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Customers</h1>

      <div className="flex flex-wrap items-center gap-6">
        <span className="h-20 w-20 shrink-0 rounded-full bg-primary-100" />
        <div className="flex flex-wrap gap-6 text-sm text-gray-500 sm:gap-10">
          <div>
            <p>Date Joined:</p>
            <p className="mt-1 font-medium text-gray-800">
              {new Date(profile.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </p>
          </div>
          <div>
            <p>Bills Uploaded:</p>
            <p className="mt-1 font-medium text-gray-800">{String(billsCount ?? 0).padStart(2, "0")}</p>
          </div>
          <div>
            <p>Active Cases:</p>
            <p className="mt-1 font-medium text-gray-800">{String(casesCount ?? 0).padStart(2, "0")}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Field label="Full name" value={profile.name} />
        <Field label="Email" value={profile.email} />
        <Field label="Status" value={profile.status === "active" ? "Active" : "Suspended"} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Documents</h2>
        {bills.length === 0 ? (
          <p className="text-sm text-gray-400">No bills uploaded yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {bills.map((bill, i) => (
              <BillDocumentCard key={bill.id} doc={bill} label={`Bill ${i + 1}`} />
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PendingDocumentCard label="AI Generated Letter" />
          <PendingDocumentCard label="Provider Letter" />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-start gap-4">
        <AccountActions userId={profile.id} initialStatus={profile.status} canDelete={Boolean(canDelete)} />
        <PromoteToAdmin userId={profile.id} roles={roles ?? []} />
      </div>
    </div>
  );
}
