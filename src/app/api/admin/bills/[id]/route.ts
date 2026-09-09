import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Gated by can_delete_bills() (see roles.can_delete_bills), not just
// is_admin() — same "delete needs a higher bar" reasoning as
// can_delete_accounts (docs/DESIGN-SYSTEM.md history / BACKEND-PLAN.md's
// RBAC notes), applied to a customer's uploaded bill.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: canDelete } = await supabase.rpc("can_delete_bills");
  if (!canDelete) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("id, filename, storage_url")
    .eq("id", id)
    .maybeSingle();
  if (!bill) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Refuse to delete a bill that's become a real case or already has a
  // paid payment behind it — this is meant to clear a bad/duplicate
  // upload, not let an admin silently erase evidence of a paid case.
  // Checked independently rather than relying only on the case check,
  // same defense-in-depth style as the webhook's own case-creation guard.
  const { data: existingCase } = await supabase.from("cases").select("id").eq("bill_id", id).maybeSingle();
  const { data: paidPayment } = await supabase
    .from("payment_records")
    .select("id")
    .eq("bill_id", id)
    .eq("status", "paid")
    .maybeSingle();
  if (existingCase || paidPayment) {
    return NextResponse.json({ error: "This bill has an active case and can't be deleted." }, { status: 409 });
  }

  const admin = createAdminClient();

  // Any leftover pending/failed payment attempt for this bill (no case,
  // no successful charge) isn't a real transaction — safe to clear
  // alongside the bill.
  await admin.from("payment_records").delete().eq("bill_id", id).neq("status", "paid");

  if (bill.storage_url) {
    const { error: storageError } = await admin.storage.from("bills").remove([bill.storage_url]);
    if (storageError) {
      console.error("Failed to remove bill file from storage for", id, storageError);
    }
  }

  const { error: deleteError } = await admin.from("bills").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data: caller } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  await supabase.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: caller?.name ?? "Unknown",
    action: "deleted_bill",
    target_id: id,
    target_name: bill.filename,
  });

  return NextResponse.json({ ok: true });
}
