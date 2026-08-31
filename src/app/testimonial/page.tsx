import { createClient } from "@/lib/supabase/server";
import TestimonialForm from "@/components/testimonial/TestimonialForm";

export default async function TestimonialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user!.id)
    .single();

  return <TestimonialForm userId={user!.id} name={profile?.name ?? ""} email={profile?.email ?? ""} />;
}
