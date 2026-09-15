import { createClient } from "@/lib/supabase/server";
import AdminTestimonialsClient from "@/components/admin/AdminTestimonialsClient";
import { getDomainAccess, hasDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";

export default async function AdminTestimonialsPage() {
  const supabase = await createClient();

  const clientDataAccess = await getDomainAccess(supabase, "client_data");
  if (!hasDomainAccess(clientDataAccess)) {
    return <AccessRestricted />;
  }
  const canWrite = hasFullDomainAccess(clientDataAccess);

  const { data } = await supabase
    .from("testimonials")
    .select("id, name, message, rating, status, created_at, profiles(email)")
    .order("created_at", { ascending: false });

  const testimonials = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      name: row.name,
      email: profile?.email ?? "",
      message: row.message,
      rating: row.rating,
      status: row.status as "pending" | "approved" | "rejected",
      createdAt: row.created_at,
    };
  });

  return <AdminTestimonialsClient initialTestimonials={testimonials} canWrite={canWrite} />;
}
