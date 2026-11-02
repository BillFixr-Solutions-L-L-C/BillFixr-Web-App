// Retrying a stalled case means re-running the AI/OCR pipeline, and there
// is no admin route that can do that: /api/dev/process-with-ai is scoped
// to the case's own owner, and no admin equivalent exists yet.
//
// So this is deliberately inert and says so, matching ManualOverridePanel's
// "Re-Run AI Analysis". The version it replaced looked like it worked — it
// removed the row from local state, so the task appeared to clear while
// nothing had been retried, which on a monitoring screen is worse than a
// button that admits it cannot act.
export default function RetryStalledCases({
  caseIds,
  label,
  compact = false,
  disabled = true,
}: {
  caseIds: string[];
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const title = disabled
    ? "Not available yet — retrying depends on the AI/OCR pipeline"
    : `Retry ${caseIds.length} case${caseIds.length === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      disabled
      title={title}
      aria-label={`${label} (${caseIds.length})`}
      className={
        compact
          ? "rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-400"
          : "rounded-full bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-400"
      }
    >
      {label}
    </button>
  );
}
