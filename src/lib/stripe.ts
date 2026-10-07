import Stripe from "stripe";

// Server-only. Do not import from a Client Component — this holds the
// secret key. Pinned to the API version bundled with the installed
// `stripe` package (its types are tied to this exact version literal)
// rather than left to the Stripe account's dashboard-configured default,
// so a future Stripe-side default-version change can't silently alter
// behavior here.
let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    client = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
  }
  return client;
}

// Constructed on first use, not at import time. `next build` imports every
// route module to collect its page data, so building the client at module
// scope made the whole build fail wherever the key is absent — which is
// the case in CI, and meant the "Lint, typecheck, test, build" check could
// never pass there even though Vercel (which has the key) built fine.
// Deferring it means a missing key fails the request that actually needs
// Stripe, with a clear message, instead of the build.
//
// A proxy rather than a `getStripe()` export purely so every call site and
// every test mock keeps using `stripe.paymentIntents…` unchanged.
export const stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const value = Reflect.get(getStripe(), property) as unknown;
    return typeof value === "function" ? value.bind(getStripe()) : value;
  },
});

export const COMMITMENT_FEE_CENTS = 500;
export const MIN_CHARGE_CENTS = 50; // Stripe's own minimum for a USD charge
