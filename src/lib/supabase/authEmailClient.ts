import { createClient } from "@supabase/supabase-js";

// @supabase/ssr's createBrowserClient (src/lib/supabase/client.ts) hardcodes
// flowType: "pkce" with no way to override it (checked directly in
// node_modules/@supabase/ssr/dist/main/createBrowserClient.js — the
// hardcoded value is spread in *after* the caller's options, so it can't be
// overridden through the public API). Under PKCE, signUp()/
// resetPasswordForEmail()/resend() send a code_challenge, which makes
// Supabase embed a `pkce_`-prefixed code in the confirmation/recovery
// email's {{ .TokenHash }} instead of a plain OTP hash — and a PKCE code can
// only ever be redeemed via exchangeCodeForSession() together with the
// code_verifier cookie set on the exact browser/session that made the
// original call. That's fundamentally incompatible with this app's
// /auth/confirm route, which does server-side verifyOtp({ type, token_hash })
// specifically so a link works from any device/browser (see the
// cross-device signup-pairing feature, which depends on this).
//
// Use this client — not the SSR one — for any call that triggers a
// confirmation/recovery/magic-link email: signUp(), resetPasswordForEmail(),
// resend(). None of those establish a session on their own (email
// confirmations are required, so signUp() returns no session until the link
// is clicked), so there's no cookie/session state to keep in sync with the
// SSR client — persistSession is off to guarantee that stays true.
export function createAuthEmailClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}
