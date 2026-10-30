"use client";

import { useState } from "react";

type Decision = "approved" | "rejected" | "escalated";

const DECISION_LABEL: Record<Decision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  escalated: "Escalated",
};

export default function ManualOverridePanel({
  caseId,
  initialNotes,
  initialOverrideReason,
  initialApprovalChain,
  initialDecision,
  canWrite,
}: {
  caseId: string;
  initialNotes: string;
  initialOverrideReason: string;
  initialApprovalChain: string;
  initialDecision: Decision | null;
  canWrite: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [overrideReason, setOverrideReason] = useState(initialOverrideReason);
  const [approvalChain, setApprovalChain] = useState(initialApprovalChain);
  const [decision, setDecision] = useState(initialDecision);
  const [saving, setSaving] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextDecision: Decision) {
    setSaving(nextDecision);
    setError(null);

    const res = await fetch(`/api/admin/cases/${caseId}/override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: nextDecision, notes, overrideReason, approvalChain }),
    });

    setSaving(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to save.");
      return;
    }
    setDecision(nextDecision);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Manual Override &amp; Administrative Controls</h2>
        {decision && (
          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
            {DECISION_LABEL[decision]}
          </span>
        )}
      </div>

      <label className="text-sm text-gray-600">Manual Notes</label>
      <textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        readOnly={!canWrite}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-sm text-gray-600">Override Reason</label>
      <input
        value={overrideReason}
        onChange={(e) => setOverrideReason(e.target.value)}
        readOnly={!canWrite}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-sm text-gray-600">Approval Chain</label>
      <input
        value={approvalChain}
        onChange={(e) => setApprovalChain(e.target.value)}
        readOnly={!canWrite}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {/* Manual Approve is the only decision the current design offers —
          Reject and Deny & Escalate are gone from Figma. Nothing is lost
          by it: this panel is an annotation track that never touched the
          case lifecycle, so those buttons only ever wrote a different
          word into manual_review_status. The type and labels below still
          cover all three so a case decided before this change keeps
          displaying correctly. */}
      {canWrite && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => submit("approved")}
            disabled={saving !== null}
            className="rounded-full bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving === "approved" ? "Saving…" : "Manual Approve"}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled
        title="Not available yet — depends on the AI/OCR pipeline"
        className="mt-2 w-full rounded-full bg-gray-100 py-2 text-sm font-semibold text-gray-400"
      >
        Re-Run AI Analysis
      </button>
    </div>
  );
}
