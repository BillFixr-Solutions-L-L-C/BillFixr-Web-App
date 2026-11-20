import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asLanguage } from "@/lib/language";
import { sendConfirmation } from "@/app/api/auth/register/route";

// "Send it again" from the check-your-email screen.
//
// A magic link rather than a second signup link, because the signup form
// is where the password was and this screen does not have it. Verifying a
// magic link confirms the address just as the signup link does -- both
// prove the same thing, that the person reading the mail owns the
// mailbox -- and src/app/auth/confirm/route.ts redeems either.
//
// Answers the same way whatever happened, for the same reason the
// register route does: a different answer for "no such address" turns
// this into a way of asking who has an account.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const language = asLanguage(body?.language);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    // Logged, not reported: an address with no account, or one already
    // confirmed, is not something the sender is entitled to learn.
    console.error("Could not resend a confirmation to", email, error?.message ?? "no token");
    return NextResponse.json({ ok: true });
  }

  await sendConfirmation({ email, tokenHash, language, type: "magiclink" });

  return NextResponse.json({ ok: true });
}
