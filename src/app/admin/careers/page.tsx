import { createClient } from "@/lib/supabase/server";
import AdminCareersClient from "@/components/admin/AdminCareersClient";

export default async function AdminCareersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_postings")
    .select("id, title, location, listing_description, responsibilities, requirements, benefit, status")
    .order("created_at", { ascending: false });

  const initialPostings = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    listingDescription: row.listing_description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    benefit: row.benefit,
    status: row.status,
  }));

  return <AdminCareersClient initialPostings={initialPostings} />;
}
