"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";

export default function AccountActions({
  userId,
  initialStatus,
  canDelete,
}: {
  userId: string;
  initialStatus: "active" | "suspended";
  canDelete: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleSuspend() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const nextStatus = status === "active" ? "suspended" : "active";
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ status: nextStatus })
      .eq("id", userId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus(nextStatus);
    router.refresh();
  }

  async function deleteAccount() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setConfirmingDelete(false);
      setError(body.error ?? "Failed to delete account");
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={toggleSuspend}
          disabled={busy}
          className="rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {status === "active" ? "Suspend account" : "Reactivate account"}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            Delete Account
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="Delete this account?"
        message="This permanently deletes the account and all associated data. This cannot be undone."
        confirmLabel="Yes, Delete Account"
        danger
        busy={busy}
        onConfirm={deleteAccount}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
