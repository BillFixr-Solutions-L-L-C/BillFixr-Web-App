import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Server-side confirmation for both signup and password-recovery email
// links. Deliberately NOT the client-side exchangeCodeForSession pattern
// (which the confirmation/recovery templates used to point at via
// {{ .ConfirmationURL }}) — that relies on a PKCE code_verifier cookie
// written by the browser client at signup/reset-request time matching
// back up when the link is clicked, and in practice this kept failing
// with AuthPKCECodeVerifierMissingError even within the same browser,
// same session, no device change (root cause not fully pinned down, but
// reproducible every time in this app's dev+proxy setup). verifyOtp with
// a token_hash is self-contained — no separate verifier to lose track of —
// and it's Supabase's own documented pattern for Next.js SSR apps.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_or_expired_link`);
}
