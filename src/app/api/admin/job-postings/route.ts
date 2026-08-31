import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { title, location, listingDescription, responsibilities, requirements, benefit } = body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof location !== "string" ||
    !location.trim() ||
    typeof listingDescription !== "string" ||
    !listingDescription.trim() ||
    !Array.isArray(responsibilities) ||
    !Array.isArray(requirements)
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

  const { data: posting, error } = await supabase
    .from("job_postings")
    .insert({
      title: title.trim(),
      location: location.trim(),
      listing_description: listingDescription.trim(),
      responsibilities,
      requirements,
      benefit: typeof benefit === "string" && benefit.trim() ? benefit.trim() : null,
    })
    .select("id")
    .single();
  if (error || !posting) {
    return NextResponse.json({ error: error?.message ?? "failed to create posting" }, { status: 500 });
  }

  return NextResponse.json({ id: posting.id });
}
