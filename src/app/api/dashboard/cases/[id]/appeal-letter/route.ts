import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_LETTER_LENGTH = 20000;

// Customers have no UPDATE path on cases under RLS (status and the AI
// columns must stay server-controlled), so saving an edited letter goes
// through here: ownership is checked with the session client, then only
// this one column is written with the service role.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await request.json();

  if (typeof text !== "string" || !text.trim() || text.length > MAX_LETTER_LENGTH) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, letter_sent_at")
    .eq("id", id)
    .single();
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (caseRow.letter_sent_at) {
    return NextResponse.json({ error: "letter already sent" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cases").update({ appeal_letter_text: text }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
