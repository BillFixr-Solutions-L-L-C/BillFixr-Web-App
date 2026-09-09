"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/components/ConfirmModal";

export default function DeleteBillButton({
  billId,
  filename,
  canDelete,
  onDeleted,
}: {
  billId: string;
  filename: string;
  canDelete: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canDelete) return null;

  async function handleDelete() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/bills/${billId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setConfirming(false);
      setError(body.error ?? "Failed to delete bill");
      return;
    }
    setBusy(false);
    setConfirming(false);
    onDeleted?.();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
      >
        Delete
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      <ConfirmModal
        open={confirming}
        title="Delete this bill?"
        message={`This permanently deletes "${filename}" and its file. This cannot be undone.`}
        confirmLabel="Yes, Delete Bill"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
