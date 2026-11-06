"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Shown only when the engine is holding a settlement for review.
//
// The hold itself is deliberate: nothing is agreed off an audit no person
// has checked. What was missing was the way out of it — a case could sit
// held forever with the customer already told their provider had
// responded. This is that way out.
export default function HeldSettlementPanel({
  caseId,
  pendingAmount,
  totalBilled,
  reason,
  heldAt,
  canApprove,
}: {
  caseId: string;
  pendingAmount: number;
  totalBilled: number | null;
  reason: string | null;
  heldAt: string | null;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const money = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const saving = totalBilled && totalBilled > pendingAmount ? totalBilled - pendingAmount : null;
  const blockers = (reason ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  async function approve() {
    setApproving(true);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/approve-settlement`, { method: "POST" });

    setApproving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to approve the settlement.");
      return;
    }
    setApproved(true);
    // The case status, the timeline and the fee all change server-side.
    router.refresh();
  }

  return (
    <div className="rounded-2xl border-2 border-accent-600 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-bold text-gray-900">Settlement waiting for your review</h2>
          <p className="mt-1 text-sm text-gray-600">
            The provider agreed. Nothing has been confirmed to them yet, because a finding on this bill still
            needs a person to check it.
          </p>
        </div>
        {heldAt && (
          <span className="shrink-0 text-xs text-gray-500">
            Held {new Date(heldAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-6 rounded-xl bg-gray-50 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Provider agreed to</p>
          <p className="text-xl font-semibold text-primary-700">{money(pendingAmount)}</p>
        </div>
        {totalBilled !== null && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Originally billed</p>
            <p className="text-xl font-semibold text-gray-900">{money(totalBilled)}</p>
          </div>
        )}
        {saving !== null && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Client saves</p>
            <p className="text-xl font-semibold text-primary-700">{money(saving)}</p>
          </div>
        )}
      </div>

      {blockers.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Findings to check first</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {blockers.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-accent-600">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approved ? (
        <p className="mt-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800">
          Settlement confirmed at {money(pendingAmount)}. The provider has been asked for a revised bill.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={approve}
            disabled={!canApprove || approving}
            className="mt-5 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approving ? "Confirming…" : `Approve and confirm ${money(pendingAmount)}`}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            {canApprove
              ? "This accepts on the client's behalf at the figure above and asks the provider for a revised bill."
              : "You do not have full access to the negotiation domain, so you cannot approve a settlement."}
          </p>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
