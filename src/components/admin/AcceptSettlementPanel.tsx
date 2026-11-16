"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Accepting a provider's offer at a figure a person chose.
//
// Distinct from HeldSettlementPanel, which releases a settlement
// autopilot already decided on and parked for review — that one takes no
// amount, because the only figure it may settle at is the one the
// hospital agreed to. This is for everything else: a figure agreed on the
// phone, or a counter autopilot would not take on its own.
export default function AcceptSettlementPanel({
  caseId,
  patientBalance,
  currentOffer,
  canAccept,
}: {
  caseId: string;
  /** What the client owes today — the settlement has to come in under it. */
  patientBalance: number;
  /** What we last offered the provider, as a starting point. */
  currentOffer: number | null;
  canAccept: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(currentOffer != null ? String(currentOffer) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<number | null>(null);

  const money = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const entered = Number(amount);
  const valid = Number.isFinite(entered) && entered > 0 && entered < patientBalance;
  // Shown before anything is sent, so the consequence of the number in
  // the box is visible while it is still being typed.
  const saving_ = valid ? Math.round((patientBalance - entered) * 100) / 100 : null;

  async function accept() {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/accept-settlement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: entered }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to record the settlement.");
      return;
    }
    setSettled(entered);
    router.refresh();
  }

  if (settled !== null) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg font-bold text-gray-900">Settlement recorded</h2>
        <p className="mt-2 text-sm text-gray-600">
          Agreed at {money(settled)}. The provider has been asked for a revised bill, and the client&apos;s
          success fee is a share of what they saved.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-gray-900">Record a settlement</h2>
      <p className="mt-1 text-sm text-gray-600">
        The provider has responded. If they have agreed a figure that the automation did not take on its own —
        over the phone, or in a counter — record it here. The client currently owes {money(patientBalance)}.
      </p>

      <label htmlFor="settlement-amount" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Amount the provider agreed to
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-gray-500">$</span>
        <input
          id="settlement-amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {saving_ !== null && (
        <p className="mt-2 text-sm text-gray-600">
          Client saves <span className="font-semibold text-primary-700">{money(saving_)}</span>, and the success
          fee is a share of that.
        </p>
      )}
      {amount !== "" && !valid && (
        <p className="mt-2 text-sm text-amber-700">
          Enter a figure under {money(patientBalance)} — anything at or above it is not a reduction.
        </p>
      )}

      <button
        type="button"
        onClick={accept}
        disabled={!canAccept || !valid || saving}
        className="mt-4 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Recording…" : "Accept on the client's behalf"}
      </button>
      <p className="mt-2 text-xs text-gray-500">
        {canAccept
          ? "This commits the client to the amount above and asks the provider for a revised bill."
          : "You do not have full access to the negotiation domain, so you cannot record a settlement."}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
