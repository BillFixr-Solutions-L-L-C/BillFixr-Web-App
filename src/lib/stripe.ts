import Stripe from "stripe";

// Server-only. Do not import from a Client Component — this holds the
// secret key. Pinned to the API version bundled with the installed
// `stripe` package (its types are tied to this exact version literal)
// rather than left to the Stripe account's dashboard-configured default,
// so a future Stripe-side default-version change can't silently alter
// behavior here.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-08-26.dahlia",
});

export const COMMITMENT_FEE_CENTS = 500;
export const MIN_CHARGE_CENTS = 50; // Stripe's own minimum for a USD charge
