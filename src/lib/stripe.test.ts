import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The three Stripe route tests mock "@/lib/stripe" wholesale, so nothing
// else exercises the lazy proxy itself — which is the part that decides
// whether `next build` succeeds without a key.
describe("lib/stripe", () => {
  const realKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (realKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = realKey;
  });

  it("does not need the key just to import the module", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    // This is exactly what `next build` does when collecting page data:
    // import the module without ever calling Stripe.
    const mod = await import("./stripe");
    expect(mod.COMMITMENT_FEE_CENTS).toBe(500);
    expect(mod.MIN_CHARGE_CENTS).toBe(50);
  });

  it("throws a clear error when the key is missing and Stripe is actually used", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { stripe } = await import("./stripe");
    expect(() => stripe.paymentIntents).toThrow("STRIPE_SECRET_KEY is not set");
  });

  it("exposes the real resource namespaces once a key is present", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_unit_test";
    const { stripe } = await import("./stripe");
    expect(typeof stripe.paymentIntents.create).toBe("function");
    expect(typeof stripe.refunds.create).toBe("function");
    expect(typeof stripe.webhooks.constructEvent).toBe("function");
  });

  it("builds the client once and reuses it", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_unit_test";
    const { stripe } = await import("./stripe");
    expect(stripe.paymentIntents).toBe(stripe.paymentIntents);
  });
});
