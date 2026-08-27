import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Case status updates are deliberately not writable directly by
// customers via RLS (see cases_admin_write in the schema) — otherwise
// anyone could open dev tools and set their own case straight to
// "paid". This route stands in for what will eventually be real
// triggers (AI analysis completing, a provider-response webhook, a
// payment webhook): it validates the caller actually owns the case,
// only allows a fixed allowlist of "safe to self-advance" statuses,
// then performs the write with the service role.
const ALLOWED_STATUSES = new Set(["awaiting_response", "response_received", "paid"]);

export async function POST(request: Request) {
  const { caseId, toStatus } = await request.json();

  if (typeof caseId !== "string" || !ALLOWED_STATUSES.has(toStatus)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase.from("cases").select("id, user_id").eq("id", caseId).single();
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cases").update({ status: toStatus }).eq("id", caseId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
