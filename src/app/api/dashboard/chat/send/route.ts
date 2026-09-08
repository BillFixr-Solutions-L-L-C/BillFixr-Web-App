import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANNED_AGENT_REPLY } from "@/lib/support";

// Sends a user's live-chat message and the canned acknowledgment reply
// that follows it. Split into two inserts on purpose: the RLS-governed
// session-scoped client can only ever insert from='user' (see
// chat_messages_insert_own_or_admin) — a customer should never be able
// to write an 'agent'/'ai' row with arbitrary text into their own chat
// history. The canned reply's text is fixed server-side and inserted via
// the service role, which bypasses that restriction safely since there's
// nothing caller-controlled in it.
export async function POST(request: Request) {
  const { ticketId, text } = await request.json();
  if (typeof ticketId !== "string" || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: ticket } = await supabase.from("support_tickets").select("id, user_id").eq("id", ticketId).single();
  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error: userMsgError } = await supabase
    .from("chat_messages")
    .insert({ ticket_id: ticketId, from: "user", text: text.trim() });
  if (userMsgError) {
    return NextResponse.json({ error: userMsgError.message }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from("chat_messages").insert({ ticket_id: ticketId, from: "agent", text: CANNED_AGENT_REPLY });

  return NextResponse.json({ ok: true });
}
