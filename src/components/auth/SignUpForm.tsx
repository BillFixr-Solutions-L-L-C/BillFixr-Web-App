"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/authErrors";

export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      setError(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }

    // With email confirmations enabled, signUp doesn't return an active
    // session — the account only activates once the confirmation link is
    // clicked, so there's nothing to redirect into yet.
    if (!data.session) {
      setConfirmationSent(true);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (confirmationSent) {
    return (
      <div className="mt-8 flex flex-col gap-4 text-center">
        <h2 className="text-lg font-semibold text-primary-900">Check your email</h2>
        <p className="text-sm text-gray-500">
          We sent a confirmation link to <span className="font-medium text-primary-900">{email}</span>. Click it to
          activate your account.
        </p>
        <Link href="/login" className="mt-2 text-sm font-medium text-accent-600">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <input
        type="text"
        placeholder="Full Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />
      <input
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />
      <input
        type="password"
        placeholder="Password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Link href="/forgot-password" className="text-sm text-gray-500 hover:text-gray-700">
        Forget Password
      </Link>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent-600">
          Log in
        </Link>
      </p>
    </form>
  );
}
