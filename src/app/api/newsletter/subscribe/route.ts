import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { email } = await request.json();
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("newsletter_subscribers").insert({ email });

  // Unique-violation means they're already subscribed — treat as success.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Failed to subscribe. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
