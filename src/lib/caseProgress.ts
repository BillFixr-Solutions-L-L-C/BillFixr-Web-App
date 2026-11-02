// Where a case has got to, as the five stages the customer sees on the
// dashboard: Upload, Scan, Negotiation, Response, Complete.
//
// The customer's TextStepper is driven by their position in the upload
// flow, which is a UI stage, not the case's status. Admin needs the
// opposite: the stage a case is actually at, read off `cases.status`.
// That is what this derives, so the two screens describe one case the
// same way.
//
// Every status in the table's check constraint is mapped on purpose. An
// unmapped one would otherwise land on whatever the fallback happened to
// be, and a case silently shown at the wrong stage is worse on an admin
// screen than one shown as unknown.

export const CASE_STEPS = ["Upload", "Scan", "Negotiation", "Response", "Complete"] as const;

export type CaseProgress = {
  /** Index into CASE_STEPS, or null when the status is not one we know. */
  step: number | null;
  /** True once the case has finished, however it finished. */
  done: boolean;
  /** Why it is at this stage, in a line an admin can read. */
  detail: string;
};

const PROGRESS: Record<string, CaseProgress> = {
  uploaded: { step: 0, done: false, detail: "The bill has been uploaded. Nothing has read it yet." },
  scanning: { step: 1, done: false, detail: "Waiting to be read. Nothing advances this on its own." },
  analyzed: { step: 1, done: false, detail: "The bill has been read. The dispute letter has not gone out." },
  letter_sent: { step: 2, done: false, detail: "The dispute letter has been sent to the provider." },
  awaiting_response: { step: 2, done: false, detail: "Sent. Waiting on the provider to reply." },
  response_received: { step: 3, done: false, detail: "The provider has replied." },
  payment_pending: { step: 3, done: false, detail: "Settled. Waiting on the customer's success fee." },
  resolved: { step: 4, done: true, detail: "Resolved." },
  paid: { step: 4, done: true, detail: "Resolved and the success fee is paid." },
  closed: { step: 4, done: true, detail: "Closed." },
  // Ended at the scan rather than running the full course: there was
  // nothing to dispute, so it never reached Negotiation. Shown as
  // finished because it is, not because it went all the way.
  closed_no_errors: { step: 4, done: true, detail: "Closed — no errors were found, so no fee was charged." },
};

export function caseProgress(status: string): CaseProgress {
  return (
    PROGRESS[status] ?? {
      step: null,
      done: false,
      detail: `Unrecognised status "${status}".`,
    }
  );
}

/** True when the case finished without ever reaching a negotiation. */
export function endedEarly(status: string): boolean {
  return status === "closed_no_errors";
}
