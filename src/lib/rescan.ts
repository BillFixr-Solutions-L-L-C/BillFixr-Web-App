// How many times a customer may ask us to read their bill again.
//
// Raised from one to two on 2026-11-13, so there is a second look
// available at the point it is actually wanted: after reading the analysis
// and the appeal letter side by side, just before pressing Proceed.
//
// The allowance lives here rather than being implied by a nullable
// timestamp column, so changing it is a one-line change and not a
// migration. Each re-scan is a real AI read of the document and costs
// money, which is why there is a ceiling at all.
export const MAX_RESCANS = 2;

/** Whether this case may be re-scanned again. */
export function canRescan(caseRow: { rescan_count?: number | null } | null | undefined): boolean {
  return used(caseRow) < MAX_RESCANS;
}

/** How many re-scans this case has used. Treats a missing count as none. */
export function used(caseRow: { rescan_count?: number | null } | null | undefined): number {
  const count = Number(caseRow?.rescan_count ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** How many are left, never negative. */
export function remaining(caseRow: { rescan_count?: number | null } | null | undefined): number {
  return Math.max(0, MAX_RESCANS - used(caseRow));
}

/**
 * What to tell the customer about the button.
 *
 * Says how many are left rather than only refusing at the end, because a
 * customer who does not know an allowance exists cannot use it -- and one
 * who does not know it is nearly spent will spend it carelessly.
 */
export function rescanHint(
  caseRow: { rescan_count?: number | null } | null | undefined,
): string {
  const left = remaining(caseRow);
  if (left === 0) return `You've used both of your re-scans for this bill.`;
  if (left === 1) return `One more re-scan available for this bill.`;
  return `${left} re-scans available for this bill.`;
}
