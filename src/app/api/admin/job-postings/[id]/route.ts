import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { title, location, listingDescription, responsibilities, requirements, benefit, status } = body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof location !== "string" ||
    !location.trim() ||
    typeof listingDescription !== "string" ||
    !listingDescription.trim() ||
    !Array.isArray(responsibilities) ||
    !Array.isArray(requirements) ||
    (status !== "open" && status !== "closed")
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("job_postings")
    .update({
      title: title.trim(),
      location: location.trim(),
      listing_description: listingDescription.trim(),
      responsibilities,
      requirements,
      benefit: typeof benefit === "string" && benefit.trim() ? benefit.trim() : null,
      status,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
