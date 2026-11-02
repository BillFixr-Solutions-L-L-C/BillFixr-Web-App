import type { AutomationNegotiation, AutomationNegotiationStatus } from "@/types/automation-engine";

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
    detail: "The provider never replied, so we've closed this case. You owe nothing.",
    tone: "attention",
  },
};

export function describeNegotiationStatus(status: string): NegotiationSummary {
  return (
    SUMMARIES[status as AutomationNegotiationStatus] ?? {
      // Reached only if the engine adds a status this app hasn't been
      // taught. Says nothing it cannot support rather than guessing.
      label: "In progress",
      detail: "We're working on this case.",
      tone: "working",
    }
  );
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
