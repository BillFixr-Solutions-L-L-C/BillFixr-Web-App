import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";

export async function PATCH(request: Request) {
  const { percentage } = await request.json();
  if (typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
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
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "finance"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ success_fee_percentage: percentage, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
