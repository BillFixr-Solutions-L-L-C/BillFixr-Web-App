import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Only for the original signup confirmation — not for the magic-link
      // hop this same logic produces (that would recreate a pairing every
      // time a paired device confirms, looping forever), and not for
      // password recovery.
      if (type === "signup" && data?.user?.email) {
        await resolvePendingPairing(data.user.id, data.user.email);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_or_expired_link`);
}

// If the device that started signup registered a pairing (see
// /api/auth/signup-pairing/start), generate it a fresh magic link and
// mark the pairing confirmed so that device's poll can pick it up and
// independently establish its own session. Best-effort — a failure here
// shouldn't block the device that actually clicked the link from
// finishing its own confirmation.
//
// Deliberately resolves *every* pending row for this user, not just one
// — React's dev-mode Strict double-invoke can legitimately create more
// than one pairing row for the same signup attempt (CheckYourEmail.tsx
// has more detail on why it doesn't try to prevent that client-side).
// Using .single() here would error out and silently no-op the whole
// feature whenever that happens.
async function resolvePendingPairing(userId: string, email: string) {
  try {
    const admin = createAdminClient();
    const { data: pairings } = await admin
      .from("signup_pairings")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());
    if (!pairings || pairings.length === 0) return;

    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link) return;

    await admin
      .from("signup_pairings")
      .update({ status: "confirmed", magic_token_hash: link.properties.hashed_token })
      .in(
        "id",
        pairings.map((p) => p.id),
      );
  } catch (err) {
    console.error("Failed to resolve signup pairing for", userId, err);
  }
}
