"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Putting a figure to the provider that autopilot would not have put, and
// stopping autopilot from answering while a person deals with it.
//
// The letter is sent to a real hospital billing department exactly as
// typed, over our advocate address, on the existing email thread. Nothing
// composes it on the writer's behalf — a draft that looked authoritative
// and went out unread is a worse outcome than an empty box.
export default function CounterOfferPanel({
  caseId,
  patientBalance,
  currentOffer,
  autopilotOn,
  canAct,
}: {
  caseId: string;
  patientBalance: number;
  currentOffer: number | null;
  autopilotOn: boolean;
  canAct: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [letter, setLetter] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [autopilot, setAutopilot] = useState(autopilotOn);
  const [switching, setSwitching] = useState(false);

  const money = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const entered = Number(amount);
  const amountValid = Number.isFinite(entered) && entered > 0 && entered < patientBalance;
  const letterValid = letter.trim().length >= 40;

  async function send() {
    setSending(true);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: entered, letter: letter.trim() }),
    });

    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to send the counter-offer.");
      return;
    }
    setSent(true);
    router.refresh();
  }

  async function flipAutopilot() {
    const next = !autopilot;
    setSwitching(true);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/counter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });

    setSwitching(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to change the automation setting.");
      return;
    }
    setAutopilot(next);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-gray-900">Take it over</h2>
      <p className="mt-1 text-sm text-gray-600">
        Autopilot answers the provider by itself and parks anything resting on a finding it is unsure of. Turn
        it off to handle this case by hand.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Automation</p>
          <p className={`text-sm font-semibold ${autopilot ? "text-primary-700" : "text-gray-900"}`}>
            {autopilot ? "On — replying automatically" : "Off — nothing goes out on its own"}
          </p>
        </div>
        <button
          type="button"
          onClick={flipAutopilot}
          disabled={!canAct || switching}
          className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {switching ? "Saving…" : autopilot ? "Turn off" : "Turn on"}
        </button>
      </div>

      {sent ? (
        <p className="mt-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800">
          Counter-offer sent on the existing thread. The provider&apos;s reply will come back the same way.
        </p>
      ) : open ? (
        <>
          <label htmlFor="counter-amount" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Amount to offer {currentOffer != null && <span className="normal-case text-gray-400">(last offered {money(currentOffer)})</span>}
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-500">$</span>
            <input
              id="counter-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none"
            />
          </div>
          {amount !== "" && !amountValid && (
            <p className="mt-2 text-sm text-amber-700">
              Enter a figure under {money(patientBalance)} — the client already owes that.
            </p>
          )}

          <label htmlFor="counter-letter" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Letter to the provider
          </label>
          <textarea
            id="counter-letter"
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
            placeholder={"Dear Billing Team,\n\nFurther to our dispute of account …"}
          />
          <p className="mt-1 text-xs text-gray-500">
            Sent to the provider exactly as typed, in English, on the existing thread. Nothing is added to it.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={send}
              disabled={!canAct || !amountValid || !letterValid || sending}
              className="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send to the provider"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={sending}
              className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canAct}
          className="mt-4 rounded-full border border-[#0f7545] px-6 py-2.5 text-sm font-semibold text-[#0f7545] hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Write a counter-offer
        </button>
      )}

      {!canAct && (
        <p className="mt-2 text-xs text-gray-500">
          You do not have full access to the negotiation domain, so you cannot write to the provider.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
