import type { AutomationNegotiation, AutomationNegotiationStatus } from "@/types/automation-engine";
import type { Language } from "@/lib/language";
import { SUMMARIES_ES } from "@/lib/negotiationStatus.es";

// Turns the engine's status into something a customer can read.
//
// The engine's names are written for the engine ("DISPATCHED",
// "PROVIDER_NO_ERROR"), and several describe our side of the work rather
// than theirs. Every one of the 16 is mapped here on purpose: an
// unmapped status would otherwise reach the customer raw, and a default
// like "In progress" would quietly hide the ones that mean the case has
// stopped.

export type NegotiationTone = "working" | "attention" | "good" | "done";

export type NegotiationSummary = {
  label: string;
  detail: string;
  tone: NegotiationTone;
};

const SUMMARIES: Record<AutomationNegotiationStatus, NegotiationSummary> = {
  DISPATCHED: {
    label: "Letter sent",
    detail: "We've written to the provider's billing department and are waiting on their reply.",
    tone: "working",
  },
  IN_REVIEW: {
    label: "Under review by the provider",
    detail: "The provider has the dispute and is reviewing it.",
    tone: "working",
  },
  REPLY_RECEIVED: {
    label: "Reply received",
    detail: "The provider has written back. We're reading their response.",
    tone: "working",
  },
  COUNTER_OFFER_SENT: {
    label: "Counter-offer sent",
    detail: "We've countered the provider's position and are waiting on their reply.",
    tone: "working",
  },
  COUNTER_OFFER_RECEIVED: {
    label: "Counter-offer received",
    detail: "The provider has made an offer. We're reviewing whether to accept or push further.",
    tone: "working",
  },
  DISPUTE_ESCALATION: {
    label: "Escalated",
    detail: "The provider rejected the dispute, so we've escalated it with a formal rebuttal.",
    tone: "working",
  },
  PROVIDER_NO_ERROR: {
    label: "Provider disputes the findings",
    detail: "The provider says the bill is correct. We're preparing the next step.",
    tone: "attention",
  },
  FINANCIAL_ASSISTANCE_REQUIRED: {
    label: "Financial assistance needed",
    detail: "The provider has pointed us to their financial assistance process. This may need something from you.",
    tone: "attention",
  },
  ITEMIZED_BILL_RECEIVED: {
    label: "Itemised bill received",
    detail: "The provider sent a full line-by-line bill. We're auditing it.",
    tone: "working",
  },
  HIPAA_AUTH_PENDING: {
    label: "Authorisation needed",
    detail: "The provider wants written authorisation from you before they'll discuss the bill.",
    tone: "attention",
  },
  HOSPITAL_ACCEPTED: {
    label: "Provider accepted",
    detail: "The provider has agreed to a reduction. We're confirming the figures.",
    tone: "good",
  },
  HELD_FOR_REVIEW: {
    label: "With our team",
    detail: "A member of our team is reviewing this case before the next message goes out.",
    tone: "attention",
  },
  SETTLEMENT_AGREED: {
    label: "Reduction agreed",
    detail: "The reduction is agreed. We've asked the provider for the corrected bill.",
    tone: "good",
  },
  AWAITING_COMPLETION_FEE: {
    label: "Ready to finish",
    detail: "Your corrected bill is ready. It unlocks once the fee is paid.",
    tone: "good",
  },
  COMPLETED: {
    label: "Complete",
    detail: "The corrected bill is yours to download.",
    tone: "done",
  },
  CLOSED_NO_RESPONSE: {
    label: "Closed — no response",
    // "You owe nothing" used to stand alone here, and it is the most
    // consequential sentence on this screen. It means no further BillFixr
    // fee -- the success fee is a share of the reduction, and silence
    // produces no reduction. A customer whose provider ignored the
    // dispute could reasonably read the bare version as "my medical bill
    // is cancelled", which is the opposite of true and the worst possible
    // thing for this product to imply. Spelled out rather than trusted to
    // context, and spelled out before it was translated into a second
    // language where the ambiguity would have been copied.
    detail:
      "The provider never replied, so we've closed this case. You owe us nothing further - " +
      "our fee is a share of what we save you, and there was no reduction. Your bill from the provider still stands.",
    tone: "attention",
  },
};

/**
 * What this status means, for the customer, in their language.
 *
 * `language` is the CUSTOMER's communication language -- taken from the
 * profile, never from the display cookie. This sentence is our account of
 * what the provider said, which is exactly the thing that has to arrive
 * in the language they chose when they signed up.
 *
 * Untranslated, deliberately: the provider's own reply, the letters we
 * send them, and the corrected bill. Only the account of them moves.
 */
export function describeNegotiationStatus(
  status: string,
  language: Language = "en",
): NegotiationSummary {
  const english = SUMMARIES[status as AutomationNegotiationStatus] ?? {
    // Reached only if the engine adds a status this app hasn't been
    // taught. Says nothing it cannot support rather than guessing.
    label: "In progress",
    detail: "We're working on this case.",
    tone: "working" as NegotiationTone,
  };
  if (language !== "es") return english;

  // Overlaid on the English entry rather than replacing it, so `tone`
  // comes from one place and a status that has no Spanish yet still
  // renders -- in English, which is readable, rather than blank.
  const spanish = SUMMARIES_ES[status as AutomationNegotiationStatus];
  return spanish ? { ...english, ...spanish } : english;
}

// Whether the provider has actually written back, which decides if the
// customer sees the "response" view or is still waiting.
//
// This replaced `cases.status === 'response_received'`, which only the
// (dev) simulate button ever set — so the one thing that moved a case to
// "the provider replied" was the customer clicking a button themselves.
// The engine knows the real answer because it reads the provider's email.
//
// All 16 are listed, as everywhere else in this file: a default here
// would either claim a reply that never came or hide one that did. The
// four false cases are the ones where nothing has come back from the
// provider — DISPATCHED and IN_REVIEW are still waiting, HIPAA_AUTH is
// our own blocker, and CLOSED_NO_RESPONSE is the explicit silence.
const PROVIDER_RESPONDED: Record<AutomationNegotiationStatus, boolean> = {
  DISPATCHED: false,
  IN_REVIEW: false,
  HIPAA_AUTH_PENDING: false,
  CLOSED_NO_RESPONSE: false,
  REPLY_RECEIVED: true,
  COUNTER_OFFER_RECEIVED: true,
  // We only counter something they said, so a counter-offer going out
  // means one came in.
  COUNTER_OFFER_SENT: true,
  DISPUTE_ESCALATION: true,
  PROVIDER_NO_ERROR: true,
  FINANCIAL_ASSISTANCE_REQUIRED: true,
  ITEMIZED_BILL_RECEIVED: true,
  HOSPITAL_ACCEPTED: true,
  HELD_FOR_REVIEW: true,
  SETTLEMENT_AGREED: true,
  AWAITING_COMPLETION_FEE: true,
  COMPLETED: true,
};

export function providerHasResponded(status: string): boolean {
  // An unknown status is treated as "not yet": claiming a reply we cannot
  // substantiate is the worse of the two errors.
  return PROVIDER_RESPONDED[status as AutomationNegotiationStatus] ?? false;
}

// The savings the provider has actually agreed to, which is not the same
// as the audit's estimate and must never be shown as if it were. Null
// until a settlement exists.
export function agreedSavings(negotiation: Pick<AutomationNegotiation, "total_billed" | "settled_amount">): number | null {
  if (negotiation.settled_amount == null) return null;
  const saved = negotiation.total_billed - negotiation.settled_amount;
  return saved > 0 ? saved : null;
}

// SYSTEM messages are the engine's notices for the client; OUTBOUND and
// INBOUND are the emails between us and the provider.
export function clientNotices(negotiation: Pick<AutomationNegotiation, "messages">) {
  return (negotiation.messages ?? []).filter((m) => m.direction === "SYSTEM");
}
