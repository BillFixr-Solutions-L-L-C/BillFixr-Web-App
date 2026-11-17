"use client";

import { useState } from "react";
import Link from "next/link";
import { createAuthEmailClient } from "@/lib/supabase/authEmailClient";
import { useT } from "@/lib/i18n/client";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createAuthEmailClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  const t = useT();

  if (sent) {
    return (
      <div className="mt-8">
        <p className="text-sm text-gray-600">
          {t("auth.ifAccountExists")} <span className="font-medium text-gray-900">{email}</span>,
          {" "}
          {t("auth.resetLinkSent")}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        {t("auth.forgotBody")}
      </p>
      <input
        type="email"
        placeholder={t("auth.email")}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-gray-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent-600">
          {t("auth.logIn")}
        </Link>
      </p>
    </form>
  );
}
