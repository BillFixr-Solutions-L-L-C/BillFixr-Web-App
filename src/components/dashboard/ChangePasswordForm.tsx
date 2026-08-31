"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none"
      />
    </div>
  );
}

export default function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) {
      setSaving(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md flex-1">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">Change Password</h2>
      <div className="flex flex-col gap-5">
        <Field
          label="Current Password"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Field
          label="New Password"
          type="password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {saved && <p className="mt-3 text-sm text-primary-600">Password updated.</p>}

      <button
        type="submit"
        disabled={saving}
        className="mt-6 rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
