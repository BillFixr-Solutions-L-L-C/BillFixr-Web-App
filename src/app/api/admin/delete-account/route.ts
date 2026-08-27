import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Deleting an auth user is only possible via the service-role Admin API
// (not exposed through RLS-governed REST at all), and account deletion is
// irreversible — so this route re-checks authorization server-side rather
// than trusting the UI to only show the button to the right people.
// Gated by can_delete_accounts() (see roles.can_delete_accounts), not just
// is_admin() — per the Suspend-vs-Delete distinction in
// docs/DESIGN-SYSTEM.md history / BACKEND-PLAN.md's RBAC notes.
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

  const { data: cases } = await admin.from("cases").select("id").eq("user_id", userId);
  const caseIds = (cases ?? []).map((c) => c.id);
  const { data: tickets } = await admin.from("support_tickets").select("id").eq("user_id", userId);
  const ticketIds = (tickets ?? []).map((t) => t.id);

  if (ticketIds.length) {
    await admin.from("chat_messages").delete().in("ticket_id", ticketIds);
  }
  if (caseIds.length) {
    await admin.from("communication_logs").delete().in("case_id", caseIds);
    await admin.from("follow_ups").delete().in("case_id", caseIds);
  }
  await admin.from("payment_records").delete().eq("user_id", userId);
  await admin.from("support_tickets").delete().eq("user_id", userId);
  await admin.from("notifications").delete().eq("user_id", userId);
  await admin.from("testimonials").delete().eq("user_id", userId);
  if (caseIds.length) {
    await admin.from("cases").delete().eq("user_id", userId);
  }
  await admin.from("bills").delete().eq("user_id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
