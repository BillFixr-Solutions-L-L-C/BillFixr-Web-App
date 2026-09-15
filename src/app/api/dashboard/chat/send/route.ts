import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, user_id, status")
    .eq("id", ticketId)
    .single();
  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (ticket.status === "resolved") {
    return NextResponse.json({ error: "This conversation has ended." }, { status: 409 });
  }

  const { error } = await supabase
    .from("chat_messages")
    .insert({ ticket_id: ticketId, from: "user", text: text.trim() });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
