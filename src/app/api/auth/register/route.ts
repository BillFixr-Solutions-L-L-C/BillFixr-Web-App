import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { PUBLIC_EMAILS, fillCopy } from "@/lib/emailCopy";
import { asLanguage, type Language } from "@/lib/language";

// Registration, and the confirmation email that goes with it.
//
// Why this route exists at all: the confirmation email used to be sent by
// GoTrue from supabase/templates/confirmation.html. GoTrue is handed
// .Email, .TokenHash and .SiteURL and nothing else about the person, so it
// cannot pick a language -- one template, one language, whoever is
// reading. A customer who registered in Spanish got the first email
// BillFixr ever sends them in English, and the only fixes available were
// a bilingual template (both languages, every recipient) or a Send Email
// Hook, which needs configuration in the Supabase dashboard.
//
// There is a third way, which is this. admin.generateLink() CREATES the
// user and returns the confirmation token WITHOUT sending anything, so
// the email becomes ours: our template, our sender, and the language the
// person was reading the site in when they typed their address.
//
// Two things were verified against the live project before this was
// written, rather than assumed:
//
//   - generateLink on an address that already exists AND IS CONFIRMED is
//     refused with 422, and the existing password is untouched. So this
//     cannot be used to take over an account by "registering" someone
//     else's address.
//   - generateLink on an address that exists and is NOT confirmed
//     succeeds and updates the credentials. That is exactly what
//     supabase.auth.signUp() already did from the browser, so it is not
//     a change in behaviour -- it is the same semantics, moved.
//
// One thing this does lose: Supabase's own rate limiting on signUp. This
// route holds the service role, so the limit no longer applies. The
// disposable-domain trigger on auth.users still rejects what it rejected
// before, but a per-IP limit here is worth adding before launch.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const language = asLanguage(body?.language);

  if (!EMAIL_RE.test(email) || password.length < MIN_PASSWORD || !name) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      // The same metadata the browser used to send. The trigger on
      // auth.users copies it onto the profile, which is where
      // communication_language lives from then on.
      data: { name, communication_language: language },
    },
  });

  if (error) {
    // 422 is "this address is already a confirmed account". Answered the
    // same way as success on purpose: a different answer here turns this
    // route into a way of asking whether someone has an account.
    if (error.status === 422) {
      return NextResponse.json({ ok: true, confirmationSent: true });
    }
    // The disposable-domain trigger surfaces as a database error. The
    // client already shows its own message for this; the status is what
    // it keys on.
    console.error("Registration failed for", email, error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    console.error("Registration produced no confirmation token for", email);
    return NextResponse.json({ error: "We couldn't start your registration. Please try again." }, { status: 502 });
  }

  await sendConfirmation({ email, tokenHash, language });

  return NextResponse.json({ ok: true, confirmationSent: true, userId: data.user?.id ?? null });
}

export async function sendConfirmation({
  email,
  tokenHash,
  language,
  type = "signup",
}: {
  email: string;
  tokenHash: string;
  language: Language;
  type?: "signup" | "magiclink";
}) {
  const copy = PUBLIC_EMAILS[language].confirm;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.billfixr.com";
  const href = `${site}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=/welcome`;

  try {
    await sendEmail({
      to: email,
      subject: copy.subject,
      html: renderEmailCard({
        title: copy.subject,
        heading: copy.heading,
        language,
        bodyHtml: emailParagraph(fillCopy(escapeHtml(copy.body), { email: escapeHtml(email) })),
        cta: { text: copy.cta, href },
        footerNote: copy.footer,
      }),
    });
  } catch (err) {
    // The account exists either way. Failing the request would leave
    // someone with an account they were never told how to confirm, and no
    // way to ask again -- the resend route is reached from the screen
    // this one returns.
    console.error("Confirmation email failed for", email, err);
  }
}
