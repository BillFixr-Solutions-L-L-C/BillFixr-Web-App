import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { email } = await request.json();
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("newsletter_subscribers").insert({ email });

  // Unique-violation means they're already subscribed — treat as success,
  // and don't re-send the confirmation for an address that's already on
  // the list.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Failed to subscribe. Please try again." }, { status: 500 });
  }

  if (!error) {
    try {
      await sendEmail({ to: email, subject: "You're subscribed to BillFixr", html: newsletterEmailHtml() });
    } catch (err) {
      // Best-effort — the subscription itself already succeeded.
      console.error("Newsletter confirmation email failed for", email, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function newsletterEmailHtml() {
  return renderEmailCard({
    title: "You're subscribed to BillFixr",
    heading: "You're on the list",
    bodyHtml: emailParagraph(
      "Thanks for subscribing. We'll send you occasional updates on medical billing, your rights as a patient, and what BillFixr is working on.",
    ),
    footerNote: "Didn't subscribe? You can safely ignore this email.",
  });
}
