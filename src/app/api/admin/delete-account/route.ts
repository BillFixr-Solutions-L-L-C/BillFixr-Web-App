import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccountCascade } from "@/lib/deleteAccountCascade";

// Deleting an auth user is only possible via the service-role Admin API
// (not exposed through RLS-governed REST at all), and account deletion is
// irreversible — so this route re-checks authorization server-side rather
// than trusting the UI to only show the button to the right people.
// Gated by can_delete_accounts() (see roles.can_delete_accounts), not just
// is_admin() — per the Suspend-vs-Delete distinction in
// docs/DESIGN-SYSTEM.md history / BACKEND-PLAN.md's RBAC notes. For a
// user deleting their own account, see /api/account/delete instead —
// that one doesn't need this permission check at all, since anyone can
// always delete their own data.
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

  const { data: canDelete } = await supabase.rpc("can_delete_accounts");
  if (!canDelete) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: "cannot delete your own account" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller } = await supabase.from("profiles").select("name").eq("id", user.id).single();

  const { error, profileName } = await deleteAccountCascade(admin, userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: caller?.name ?? "Unknown",
    action: "deleted_account",
    target_id: userId,
    target_name: profileName ?? "Unknown",
  });

  return NextResponse.json({ ok: true });
}
