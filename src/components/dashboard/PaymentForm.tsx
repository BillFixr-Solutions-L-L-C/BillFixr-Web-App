"use client";

import { useEffect, useRef, useState } from "react";
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
  const [elementMounted, setElementMounted] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // `onReady` fires once the Payment Element is interactive, but that can
  // land before its internal resize/layout handshake with the parent page
  // has fully settled (real, reproducible: labels briefly wrap to one
  // character per line, as if given ~0px of width, before snapping to
  // their real size). Watching the wrapper's own height for a few
  // consecutive stable readings is a direct measurement of "layout has
  // actually stopped moving," instead of guessing a fixed delay that's
  // sometimes too short. A fallback timer keeps this from getting stuck
  // if resize events ever stop firing for some other reason.
  useEffect(() => {
    if (!elementMounted || !wrapperRef.current) return;
    const node = wrapperRef.current;
    let lastHeight = -1;
    let settled = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;

    const markSettled = () => {
      if (settled) return;
      settled = true;
      setElementReady(true);
    };

    // Debounced on real elapsed time, not a count of ResizeObserver
    // callback firings — several callbacks can fire back-to-back within
    // milliseconds during a still-ongoing layout pass, which would look
    // "stable" to a simple counter without actually being done. Only
    // settle once the height has gone genuinely quiet (no resize at all)
    // for a real window of time.
    const observer = new ResizeObserver(() => {
      const height = node.offsetHeight;
      if (Math.abs(height - lastHeight) >= 2 && quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
      lastHeight = height;
      if (!quietTimer) {
        quietTimer = setTimeout(markSettled, 800);
      }
    });
    observer.observe(node);

    // Confirmed by direct inspection (not guessing): sometimes the
    // Payment Element's iframe gets stuck in a genuinely broken layout
    // (labels wrapped to one character per line) that never resolves on
    // its own no matter how long you wait — this isn't "still loading,"
    // it's a missed resize handshake between the iframe and the parent
    // page. A real window `resize` event reliably kicks that handshake
    // back into gear (this is what made the difference when the same
    // stuck state was fixed by manually scrolling during investigation —
    // scrolling isn't special, it just also fires layout/resize work).
    // Nudge a couple of times before falling back to revealing regardless.
    const nudge = () => window.dispatchEvent(new Event("resize"));
    const nudgeTimers = [setTimeout(nudge, 4000), setTimeout(nudge, 10000), setTimeout(nudge, 20000)];

    const fallback = setTimeout(markSettled, 30000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
      nudgeTimers.forEach(clearTimeout);
      if (quietTimer) clearTimeout(quietTimer);
    };
  }, [elementMounted]);

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

      {/* Stripe's iframe can take a moment to finish its own internal
          layout/resize handshake with the parent page — showing it before
          `onReady` fires means real users sometimes see it mid-render
          (unstyled, clipped labels), not a permanent bug but a real bad
          first impression. A skeleton covers that gap instead of guessing
          a fixed delay. */}
      <div ref={wrapperRef} className="relative mt-5 min-h-[280px]">
        {!elementReady && (
          <div className="absolute inset-0 z-10 space-y-3 bg-white">
            <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
            <p className="pt-2 text-center text-sm text-gray-400">Loading payment options…</p>
          </div>
        )}
        <PaymentElement options={{ layout: "tabs" }} onReady={() => setElementMounted(true)} />
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
