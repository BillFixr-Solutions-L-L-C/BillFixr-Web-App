import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";

// An admin's live-chat reply. Session-scoped insert (not service role) so
// chat_messages_insert_own_or_admin's client_data:full check actually
// applies — the RLS policy is the real enforcement, this route just gives
// a clean 403 instead of a raw Postgres error.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await request.json();
  if (typeof text !== "string" || !text.trim()) {
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
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: ticket } = await supabase.from("support_tickets").select("id, status").eq("id", id).single();
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (ticket.status === "resolved") {
    return NextResponse.json({ error: "This conversation has been marked resolved." }, { status: 409 });
  }

  const { error } = await supabase.from("chat_messages").insert({ ticket_id: id, from: "agent", text: text.trim() });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
