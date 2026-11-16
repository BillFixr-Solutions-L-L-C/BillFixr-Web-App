"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Restarting a case whose analysis never ran.
//
// This button was deliberately inert for a long time, and said so: there
// was no route an admin could use, because /api/dev/process-with-ai
// answered 404 for any case the caller did not own. The version before
// that looked like it worked — it removed the row from local state, so
// the task appeared to clear while nothing had been retried, which on a
// monitoring screen is worse than a button that admits it cannot act.
//
// That gate now has an explicit way through for an admin with full
// ai_pipeline access, so this does the thing it is named after. It starts
// the analysis; it does not force a re-scan, because that spends a
// re-scan from the customer's allowance and the allowance is not ours.
export default function RetryStalledCases({
  caseIds,
  label,
  compact = false,
  canRetry = true,
}: {
  caseIds: string[];
  label: string;
  compact?: boolean;
  canRetry?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState<number>(0);

  const nothingToDo = caseIds.length === 0;

  async function retry() {
    setRunning(true);
    setDone(null);
    setFailed(0);

    let ok = 0;
    let bad = 0;
    // One at a time: each of these is an AI read, and firing a dozen at
    // once at a service that has already been struggling is how a stalled
    // queue becomes a stalled service.
    for (const caseId of caseIds) {
      const res = await fetch("/api/dev/process-with-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      }).catch(() => null);
      if (res?.ok) ok += 1;
      else bad += 1;
    }

    setRunning(false);
    setDone(ok);
    setFailed(bad);
    router.refresh();
  }

  const title = nothingToDo
    ? "Nothing is stalled"
    : canRetry
      ? `Start the analysis for ${caseIds.length} case${caseIds.length === 1 ? "" : "s"}`
      : "Needs full access to the AI pipeline domain";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={running || nothingToDo || !canRetry}
        title={title}
        aria-label={`${label} (${caseIds.length})`}
        className={
          compact
            ? "rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
            : "rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        }
      >
        {running ? "Starting…" : label}
      </button>
      {done !== null && (
        <span className={`text-xs ${failed > 0 ? "text-amber-700" : "text-primary-700"}`}>
          {done} started{failed > 0 ? `, ${failed} still stuck` : ""}
        </span>
      )}
    </span>
  );
}
