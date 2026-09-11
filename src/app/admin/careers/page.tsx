import { createClient } from "@/lib/supabase/server";
import { getApplicationDocuments } from "@/lib/billDocuments";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import AdminCareersClient from "@/components/admin/AdminCareersClient";
import AccessRestricted from "@/components/admin/AccessRestricted";

export default async function AdminCareersPage() {
  const supabase = await createClient();

  if (!hasDomainAccess(await getDomainAccess(supabase, "hr"))) {
    return <AccessRestricted />;
  }

  const [{ data: postingRows }, { data: applicationRows }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("id, title, location, listing_description, responsibilities, requirements, benefit, status")
      .order("created_at", { ascending: false }),
    supabase
      .from("job_applications")
      .select("id, full_name, email, phone, cv_storage_url, status, created_at, job_postings(title)")
      .order("created_at", { ascending: false }),
  ]);

  const initialPostings = (postingRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    listingDescription: row.listing_description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    benefit: row.benefit,
    status: row.status,
  }));

  const documents = await getApplicationDocuments(supabase, applicationRows ?? []);
  const documentById = new Map(documents.map((doc) => [doc.id, doc]));

  const initialApplicants = (applicationRows ?? []).map((row) => {
    const posting = Array.isArray(row.job_postings) ? row.job_postings[0] : row.job_postings;
    const doc = documentById.get(row.id);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: posting?.title ?? "—",
      createdAt: row.created_at,
      status: row.status as "received" | "reviewed",
      cvFilename: doc?.filename ?? "",
      cvPreviewUrl: doc?.previewUrl ?? null,
      cvDownloadUrl: doc?.downloadUrl ?? null,
    };
  });

  return <AdminCareersClient initialPostings={initialPostings} initialApplicants={initialApplicants} />;
}
