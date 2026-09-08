"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripeClient";
import type { Appearance } from "@stripe/stripe-js";

// Stripe's Payment Element renders inside its own cross-origin iframe, so
// it can't inherit this app's Tailwind classes or CSS variables (a
// `var(--font-sans)` reference would resolve against Stripe's iframe
// document, not ours, and always fall through to its fallback stack) —
// the Appearance API is the only way to theme it, and its native <select>
// dropdowns (e.g. billing country) only take styling on their closed-box
// state; the open popup list itself is OS/browser-rendered and can't be
// restyled by any web page, Stripe's included.
const STRIPE_APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#0f7545",
    colorText: "#111827",
    colorTextSecondary: "#6b7280",
    colorDanger: "#ef4444",
    borderRadius: "8px",
    fontSizeBase: "14px",
  },
  rules: {
    ".Input": {
      border: "1px solid #e5e7eb",
      boxShadow: "none",
      padding: "10px 12px",
    },
    ".Input:focus": {
      border: "1px solid #0f7545",
      boxShadow: "0 0 0 1px #0f7545",
    },
    ".Tab": {
      border: "1px solid #e5e7eb",
      boxShadow: "none",
    },
    ".Tab:hover": {
      color: "#0f7545",
    },
    ".Tab--selected": {
      border: "1px solid #0f7545",
      backgroundColor: "#f0fdf6",
      boxShadow: "none",
    },
  },
};

type LineItem = { label: string; value: string };

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// The actual card-entry fields (number/expiry/CVC) now live inside
// Stripe's own <PaymentElement> — a secure iframe, not a plain <input>.
// This is the fix for the PCI-compliance problem the old raw-<input>
// version had: card data now never touches this app's own code at all,
// only Stripe's. The branded card-preview mockup above it stays static
// (no live-typed digits to reflect anymore — that's the point) rather
// than trying to fake liveness Stripe's iframe boundary makes impossible.
function CheckoutInner({
  lineItems,
  total,
  onSuccess,
}: {
  lineItems: LineItem[];
  total: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 p-6 text-white shadow-lg">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 -left-6 h-32 w-32 rounded-full bg-black/10"
        />

        <div className="relative flex items-center justify-between">
          <span className="h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200/90 to-yellow-500/80" />
          <span className="text-sm font-semibold italic tracking-wide">Card</span>
        </div>

        <p className="relative mt-7 font-mono text-xl tracking-widest">•••• •••• •••• ••••</p>

        <div className="relative mt-6 flex items-center justify-between text-xs">
          <div>
            <p className="text-white/60">Card Holder</p>
            <p className="mt-1 font-medium uppercase tracking-wide">YOUR NAME</p>
          </div>
          <div>
            <p className="text-white/60">Expires</p>
            <p className="mt-1 font-medium">MM/YY</p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      <div className="mt-5 rounded-xl bg-gray-50 px-5 py-4">
        {lineItems.map((item) => (
          <div key={item.label} className="flex justify-between py-1 text-sm text-gray-500">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
        ))}
        <div className="my-2 border-t border-gray-200" />
        <div className="flex justify-between">
          <span className="text-sm font-semibold text-primary-700">Total Amount</span>
          <span className="text-sm font-bold text-primary-700">{total}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
      >
        <LockIcon /> {submitting ? "Processing…" : "Confirm Payment"}
      </button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <LockIcon /> Payments are encrypted and securely processed
      </p>
    </form>
  );
}

export default function PaymentForm({
  clientSecret,
  lineItems,
  total,
  onSuccess,
}: {
  clientSecret: string;
  lineItems: LineItem[];
  total: string;
  onSuccess: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
      <p className="mt-1 text-sm text-gray-500">Enter your card information to continue</p>

      <Elements stripe={getStripe()} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
        <CheckoutInner lineItems={lineItems} total={total} onSuccess={onSuccess} />
      </Elements>
    </div>
  );
}
