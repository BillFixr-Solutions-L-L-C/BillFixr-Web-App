"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createAuthEmailClient } from "@/lib/supabase/authEmailClient";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 300; // ~15 minutes, matching the pairing row's server-side expiry
const RESEND_COOLDOWN_SECONDS = 90;

export default function CheckYourEmail({ email, userId }: { email: string; userId: string }) {
  const [confirmedElsewhere, setConfirmedElsewhere] = useState(false);
  const pollCount = useRef(0);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleResend() {
    setResending(true);
    setResendMessage(null);
    const supabase = createAuthEmailClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    if (error) {
      setResendMessage(error.message);
      return;
    }
    setResendMessage("Confirmation email resent.");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  useEffect(() => {
    // Deliberately no "only run once" ref guard here — in React's dev-mode
    // Strict double-invoke, that pattern blocks the *surviving* effect
    // instance's async continuation (its own `cancelled` closure gets set
    // true by the synchronous cleanup call before its fetch even resolves,
    // and a ref-based guard then stops the second invocation from starting
    // fresh). Letting each invocation run independently, each correctly
    // cancelled via its own closure, is the standard safe pattern — the
    // extra pairing row a duplicate dev-mode invocation creates is
    // harmless (server side tolerates more than one pending row per user).
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval>;

    async function poll(pairingId: string) {
      if (cancelled) return;
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(intervalId);
        return;
      }

      const res = await fetch(`/api/auth/signup-pairing/status?id=${pairingId}`).catch(() => null);
      if (!res?.ok || cancelled) return;
      const body = await res.json();

      if (body.status === "confirmed" && body.tokenHash) {
        clearInterval(intervalId);
        setConfirmedElsewhere(true);
        // A real full navigation, not a client-side route push — this
        // needs to hit the server Route Handler the same way the actual
        // email link does, so it can set this browser's own session
        // cookies via verifyOtp.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/auth/confirm?token_hash=${body.tokenHash}&type=magiclink&next=/dashboard`;
      } else if (body.status === "expired") {
        clearInterval(intervalId);
      }
    }

    fetch("/api/auth/signup-pairing/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.pairingId || cancelled) return;
        intervalId = setInterval(() => poll(body.pairingId), POLL_INTERVAL_MS);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [userId]);

  return (
    <div className="mt-8 flex flex-col gap-4 text-center">
      <h2 className="text-lg font-semibold text-primary-900">
        {confirmedElsewhere ? "Confirmed! Taking you in..." : "Check your email"}
      </h2>
      <p className="text-sm text-gray-500">
        We sent a confirmation link to <span className="font-medium text-primary-900">{email}</span>. Click it to
        activate your account — if you open it on another device, this page will pick it up automatically.
      </p>

      {!confirmedElsewhere && (
        <div>
          {resendCooldown > 0 ? (
            <p className="text-sm text-gray-400">Didn&apos;t get it? You can resend in {resendCooldown}s</p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm font-medium text-accent-600 hover:text-accent-700 disabled:opacity-60"
            >
              {resending ? "Resending…" : "Resend confirmation email"}
            </button>
          )}
          {resendMessage && <p className="mt-1 text-sm text-gray-500">{resendMessage}</p>}
        </div>
      )}

      <Link href="/login" className="mt-2 text-sm font-medium text-accent-600">
        Back to log in
      </Link>
    </div>
  );
}
