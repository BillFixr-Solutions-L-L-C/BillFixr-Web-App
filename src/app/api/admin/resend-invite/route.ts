import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Resends the invite email for an admin account that was created but
// hasn't confirmed yet (auth.users.email_confirmed_at is still null).
export async function POST(request: Request) {
  const { userId } = await request.json();
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role, name").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("name, email").eq("id", userId).single();
  if (!target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(target.email);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: caller.name,
    action: "resent_invite",
    target_id: userId,
    target_name: target.name,
  });

  return NextResponse.json({ ok: true });
}
