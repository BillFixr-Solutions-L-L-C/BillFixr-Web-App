import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DECISIONS = new Set(["approved", "rejected", "escalated"]);

// Backs the Manual Override & Administrative Controls panel on
// admin/cases/[id]/page.tsx. A separate annotation track from
// cases.status (see the migration comment) — this never touches the
// real case lifecycle, only records the admin's manual decision plus
// whatever notes/override reason/approval chain they entered alongside it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision, notes, overrideReason, approvalChain } = await request.json();

  if (!DECISIONS.has(decision)) {
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

  const { error } = await supabase
    .from("cases")
    .update({
      manual_notes: typeof notes === "string" ? notes : null,
      override_reason: typeof overrideReason === "string" ? overrideReason : null,
      approval_chain: typeof approvalChain === "string" ? approvalChain : null,
      manual_review_status: decision,
      manual_review_by: user.id,
      manual_review_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
