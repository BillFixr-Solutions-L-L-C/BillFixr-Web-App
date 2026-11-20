import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { PUBLIC_EMAILS } from "@/lib/emailCopy";
import { asLanguage, type Language } from "@/lib/language";
import { escapeHtml } from "@/lib/html";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { email, language: requested } = await request.json();
  // Whatever the switcher was on when they typed their address. A
  // subscriber has no profile, so this is the only signal there is.
  const language = asLanguage(requested);
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
      const copy = PUBLIC_EMAILS[language].newsletter;
      await sendEmail({ to: email, subject: copy.subject, html: newsletterEmailHtml(language) });
    } catch (err) {
      // Best-effort — the subscription itself already succeeded.
      console.error("Newsletter confirmation email failed for", email, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function newsletterEmailHtml(language: Language) {
  const copy = PUBLIC_EMAILS[language].newsletter;
  return renderEmailCard({
    title: copy.subject,
    heading: copy.heading,
    language,
    bodyHtml: emailParagraph(escapeHtml(copy.body)),
    footerNote: copy.footer,
  });
}
