"use client";

import { useState } from "react";
import Link from "next/link";
import { createAuthEmailClient } from "@/lib/supabase/authEmailClient";
import { friendlyAuthError, DISPOSABLE_EMAIL_MESSAGE } from "@/lib/authErrors";
import { isBlockedEmailDomain } from "@/lib/emailDomain";
import PasswordInput from "@/components/auth/PasswordInput";
import CheckYourEmail from "@/components/auth/CheckYourEmail";
import { DISPLAY_LANGUAGE_COOKIE, FIRST_VISIT_LANGUAGE_COOKIE, registrationLanguage } from "@/lib/language";
import { readLanguageCookie } from "@/lib/languageCookie";
import { useT } from "@/lib/i18n/client";

export default function SignUpForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const supabase = createAuthEmailClient();

    // Checked here only so the message is clear and immediate; the
    // auth.users trigger is what actually enforces it.
    if (await isBlockedEmailDomain(supabase, email)) {
      setError(DISPOSABLE_EMAIL_MESSAGE);
      setLoading(false);
      return;
    }

    // The language they chose on their first visit, carried into the
    // account. The trigger on auth.users copies it onto the profile as
    // `communication_language`, and from then on it is what BillFixr
    // writes to them in -- regardless of what the site's display-language
    // switcher is later set to. See src/lib/language.ts.
    // Registration goes through our own route rather than
    // supabase.auth.signUp(). The account is created exactly the same
    // way; what changes is who sends the confirmation email. GoTrue's
    // template cannot read a language, so it wrote to everyone in
    // English -- see src/app/api/auth/register/route.ts.
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name,
        language: registrationLanguage(
          readLanguageCookie(FIRST_VISIT_LANGUAGE_COOKIE),
          readLanguageCookie(DISPLAY_LANGUAGE_COOKIE),
        ),
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);

    if (!res?.ok) {
      // The pre-check above deliberately lets a failed lookup through, so
      // the trigger can still be what rejects this. It surfaces as a bare
      // "Database error creating new user", so confirm the cause rather
      // than guessing from the wording.
      const blocked = await isBlockedEmailDomain(supabase, email);
      setError(blocked ? DISPOSABLE_EMAIL_MESSAGE : friendlyAuthError(body?.error ?? ""));
      setLoading(false);
      return;
    }

    // Email confirmations are on, so there is never a session here: the
    // account only activates once the link is clicked.
    setPendingUserId(typeof body?.userId === "string" ? body.userId : null);
    setConfirmationSent(true);
    setLoading(false);
  }

  // Not gated on the user id: an address that is already a confirmed
  // account comes back without one, and that case has to be
  // indistinguishable from a fresh signup.
  if (confirmationSent) {
    return <CheckYourEmail email={email} userId={pendingUserId} />;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <input
        type="text"
        placeholder={t("auth.fullName")}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />
      <input
        type="email"
        placeholder={t("auth.email")}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />
      <PasswordInput
        placeholder={t("auth.password")}
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordInput
        placeholder={t("auth.confirmPassword")}
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Link href="/forgot-password" className="text-sm text-gray-500 hover:text-gray-700">
        {t("auth.forgotPassword")}
      </Link>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {loading ? t("auth.creating") : t("auth.signUpCta")}
      </button>

      <p className="text-center text-sm text-gray-500">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-accent-600">
          {t("auth.logIn")}
        </Link>
      </p>
    </form>
  );
}
