import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin accounts are never created via public signup (see
// auto_create_profile.sql) — this is the one path that creates them.
// inviteUserByEmail both creates the auth user and sends the invite email
// through the already-configured Resend SMTP relay; the new admin sets
// their own password via the link. The auto-profile trigger creates the
// profile as role='customer', so we promote it to 'admin' right after.
export async function POST(request: Request) {
  const { name, email, roleId } = await request.json();
  if (typeof name !== "string" || typeof email !== "string" || typeof roleId !== "string") {
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

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
  });
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? "invite failed" }, { status: 500 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "admin", role_id: roleId, name })
    .eq("id", invited.user.id);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
