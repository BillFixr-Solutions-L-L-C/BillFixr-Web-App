"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/components/ConfirmModal";

export default function IssueRefundControl({
  paymentRecordId,
  refundableAmount,
  canRefund,
}: {
  paymentRecordId: string;
  refundableAmount: number;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(refundableAmount.toFixed(2));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canRefund) return null;

  async function handleRefund() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/payments/${paymentRecordId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setConfirming(false);
      setError(body.error ?? "Failed to issue refund");
      return;
    }
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">$</span>
        <input
          type="number"
          min="0.01"
          max={refundableAmount}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-accent-600 hover:text-accent-700"
        >
          Refund
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      <ConfirmModal
        open={confirming}
        title="Issue this refund?"
        message={`This refunds $${Number(amount || 0).toFixed(2)} to the customer via Stripe. This cannot be undone.`}
        confirmLabel="Yes, Refund"
        danger
        busy={busy}
        onConfirm={handleRefund}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
