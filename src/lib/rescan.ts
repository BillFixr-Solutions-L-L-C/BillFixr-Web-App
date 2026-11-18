import type { MessageKey } from "@/lib/i18n/messages";

// How many times a customer may ask us to read their bill again.
//
// One, set on 2026-11-18. It was briefly two, on the assumption that a
// customer would want a second look after reading the analysis and the
// appeal letter together -- but until 2026-11-18 there was no point in
// the flow where the button was reachable at all (the scan sent the
// letter in the same request that produced the analysis, so the case was
// never "analysed and not yet disputed"). With a real decision point now
// in front of the letter, one re-read is the allowance.
//
// The allowance lives here rather than being implied by a nullable
// timestamp column, so changing it is a one-line change and not a
// migration. Each re-scan is a real AI read of the document and costs
// money, which is why there is a ceiling at all.
export const MAX_RESCANS = 1;

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
 *
 * Returns a key rather than a sentence. This module is imported by a
 * server component and by an API route, neither of which holds a
 * translator, and the sentence it used to return was English on a screen
 * that is otherwise fully translated. The caller renders it.
 *
 * The plural branch is kept although MAX_RESCANS is 1 and it cannot
 * currently be reached: the allowance has already moved twice, and a
 * constant that changes should not need the copy rewritten with it.
 */
export function rescanHintKey(
  caseRow: { rescan_count?: number | null } | null | undefined,
): MessageKey {
  const left = remaining(caseRow);
  if (left === 0) return "rescan.noneLeft";
  if (left === 1) return "rescan.oneLeft";
  return "rescan.manyLeft";
}
