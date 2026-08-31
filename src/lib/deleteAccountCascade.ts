import type { SupabaseClient } from "@supabase/supabase-js";

// Deletes everything that references a profile before deleting the auth
// user itself, since none of those foreign keys are `on delete cascade`.
// Shared between the admin-triggered delete route and the self-service
// one — same cleanup either way, only the authorization check differs.
export async function deleteAccountCascade(admin: SupabaseClient, userId: string) {
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

  return admin.auth.admin.deleteUser(userId);
}
