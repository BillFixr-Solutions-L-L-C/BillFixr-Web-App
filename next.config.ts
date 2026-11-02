import type { NextConfig } from "next";

// Security audit finding (BACKEND-PLAN.md "Security plan", Medium):
// neither this file nor vercel.json set any security headers at all.
// script-src/style-src keep 'unsafe-inline' rather than a nonce-based
// CSP — Next's App Router streams RSC payloads and hydration data
// through inline <script> tags (the exact mechanism at the center of an
// earlier severe blank-page bug in this app, see BACKEND-PLAN.md Step
// 5d), and a nonce setup means generating a per-request nonce in
// middleware and threading it through every script/style — real work
// with real blast radius on the one thing that must never break again.
// This CSP is still a meaningful narrowing (blocks arbitrary
// object/embed content, restricts what a script could ever load or
// exfiltrate to, blocks framing) without touching that mechanism —
// tightening script-src further is real future work, not something to
// guess at now.
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Stripe.js (loaded by @stripe/stripe-js for the embedded PaymentElement,
// Step 7) needs its own script/frame/connect allowances — found the hard
// way when the CSP below silently killed "Failed to load Stripe.js" with
// no visible error in the UI, since frame-src has no fallback other than
// default-src 'self' when unset. These three Stripe origins are the
// standard, documented set Stripe's own CSP guide lists.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  // blob: is required by the bill upload: photos are read into an <img>
  // from a URL.createObjectURL() blob to be resized/compressed before
  // upload, and the same blobs back the thumbnails on the information
  // step. Without it the browser blocks the read and every photo upload
  // is rejected as unreadable. Blobs are same-origin and script-created,
  // so this doesn't widen what can be fetched from the network.
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} https://api.stripe.com`,
  // Supabase storage is framed, not only fetched: the document viewer
  // embeds a bill or a provider letter from its signed storage URL. The
  // same omission that killed Stripe.js killed this silently too — a
  // blocked frame renders as an empty box with the refusal only in the
  // console, so it looked like a document that would not load.
  `frame-src 'self' ${SUPABASE_ORIGIN} https://js.stripe.com https://hooks.stripe.com`,
  // 'self', not 'none': the document viewer frames documents this app
  // serves itself — the customer's watermarked case documents and the
  // appeal letter PDF. 'none' blocks a page from framing its own origin,
  // so those rendered as "refused to connect". Other sites still cannot
  // frame us, which is what this directive is for.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .trim();

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN rather than DENY, for the same reason as frame-ancestors
  // above: DENY blocks framing even by our own pages. Browsers that
  // support frame-ancestors ignore this header; it is here for ones that
  // do not, and SAMEORIGIN gives them the same rule.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
