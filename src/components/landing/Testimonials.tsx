import { createClient } from "@/lib/supabase/server";
import TestimonialsCarousel from "./TestimonialsCarousel";

export default async function Testimonials() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("testimonials")
    .select("name, message, rating")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const testimonials = (data ?? []).map((row) => ({
    quote: row.message,
    name: row.name,
    rating: row.rating,
  }));

  return <TestimonialsCarousel testimonials={testimonials} />;
}
