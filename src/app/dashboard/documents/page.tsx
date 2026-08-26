import PageHeading from "@/components/dashboard/PageHeading";
import DocumentsTable from "@/components/dashboard/DocumentsTable";
import { createClient } from "@/lib/supabase/server";

export default async function MyDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: bills } = user
    ? await supabase
        .from("bills")
        .select("id, filename, provider_name, status, uploaded_at")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false })
    : { data: [] };

  return (
    <div>
      <PageHeading title="My Documents" />
      <DocumentsTable bills={bills ?? []} />
    </div>
  );
}
