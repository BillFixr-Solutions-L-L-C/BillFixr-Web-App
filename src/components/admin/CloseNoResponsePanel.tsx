"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The ending for a case the provider never answered.
//
// /api/admin/cases/[id]/negotiation/close-no-response has existed and
// been correct for some time, and nothing called it. So a hospital that
// simply ignores us -- a normal outcome, not an error -- left the case at
// `awaiting_response` indefinitely, with the customer still being told we
// were chasing. The capability was there; the button was not.
//
// Shown only once the engine says all three follow-ups have gone out and
// the provider still has not replied. The route checks both again against
// its own live view of the negotiation, so this is the honest shape of
// the thing rather than the enforcement.
export default function CloseNoResponsePanel({
  caseId,
  followUpsSent,
  lastContactAt,
  canClose,
}: {
  caseId: string;
  followUpsSent: number;
  lastContactAt: string | null;
  canClose: boolean;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  async function close() {
    setClosing(true);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/close-no-response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
    });

    setClosing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to close the case.");
      return;
    }
    setClosed(true);
    // The status, the timeline and the customer's email all happen
    // server-side.
    router.refresh();
  }

  if (closed) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg font-bold text-gray-900">Case closed</h2>
        <p className="mt-2 text-sm text-gray-600">
          The provider never replied, so this case is closed and the client has been told. They owe no success
          fee — there was no reduction to take a share of.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-gray-900">No response from the provider</h2>
      <p className="mt-1 text-sm text-gray-600">
        All {followUpsSent} follow-ups have gone out and nothing has come back. Closing tells the client where
        this ended and charges them no success fee.
        {lastContactAt && (
          <>
            {" "}
            Last contact{" "}
            {new Date(lastContactAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            .
          </>
        )}
      </p>

      {confirming ? (
        <>
          <label htmlFor="close-reason" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Reason (optional, kept on the case file)
          </label>
          <textarea
            id="close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. billing office confirmed by phone that they will not respond in writing"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={close}
              disabled={closing}
              className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {closing ? "Closing…" : "Close the case"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={closing}
              className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This emails the client and ends the negotiation. It cannot be undone from here.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canClose}
            className="mt-4 rounded-full border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close — no response
          </button>
          {!canClose && (
            <p className="mt-2 text-xs text-gray-500">
              You do not have full access to the negotiation domain, so you cannot close a case.
            </p>
          )}
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
