import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccountCascade } from "@/lib/deleteAccountCascade";

// Self-service account deletion — a user deleting their own account
// needs no special permission (unlike /api/admin/delete-account, which
// requires can_delete_accounts() for one admin to delete someone else's).
// Takes no body at all; it only ever acts on the caller's own session,
// so there's no userId to validate or spoof.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await deleteAccountCascade(admin, user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
