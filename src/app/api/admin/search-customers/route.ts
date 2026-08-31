import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
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

  const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("role", "customer")
    .or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .limit(8);

  return NextResponse.json({ results: data ?? [] });
}
