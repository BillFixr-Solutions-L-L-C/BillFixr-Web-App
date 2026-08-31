"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";

export default function DeleteMyAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setConfirming(false);
      setError(body.error ?? "Failed to delete account");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-10 max-w-md rounded-xl border border-red-100 bg-red-50/50 p-5">
      <h2 className="text-sm font-semibold text-red-700">Delete Account</h2>
      <p className="mt-1 text-sm text-gray-600">
        Permanently delete your account and all of your data. This cannot be undone.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
      >
        Delete My Account
      </button>

      <ConfirmModal
        open={confirming}
        title="Delete your account?"
        message="This permanently deletes your BillFixr account and all associated data (bills, cases, support tickets). This cannot be undone."
        confirmLabel="Yes, Delete Account"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
