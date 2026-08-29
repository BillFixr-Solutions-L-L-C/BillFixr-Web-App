"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/authErrors";
import PasswordInput from "@/components/auth/PasswordInput";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // By the time this page loads, /auth/confirm has already verified the
  // recovery link and established the session server-side — nothing to
  // exchange here. If someone lands here without a valid session (e.g. a
  // stale bookmark), updateUser below will fail with a clear auth error.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(friendlyAuthError(error.message));
      return;
    }

    router.push("/login");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <PasswordInput
        placeholder="New password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordInput
        placeholder="Confirm new password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
