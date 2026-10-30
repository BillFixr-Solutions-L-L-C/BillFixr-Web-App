import type { CaseDocumentType } from "./caseDocuments";
import type { LetterEvent } from "./letterTracking";

// The Negotiation & Communication timeline on the admin Case Detail
// screen (Figma: "Negotiation Letter Sent" / "Client Reply Received").
//
// Built from events that actually happened — when the letter was sent,
// what Resend reported about it, and which documents arrived — rather
// than from cases.admin_analysis, which the AI workstream will populate
// one day and which is null on every case today. A timeline is the one
// part of that panel we can tell truthfully right now.

export type TimelineTone = "done" | "waiting" | "failed";

export type TimelineEntry = {
  title: string;
  subtitle?: string;
  /** ISO timestamp; the caller formats it. */
  date: string;
  tone: TimelineTone;
};

// What a document arriving means in the story of the negotiation. The
// labels differ from the document list's: there the row names a file,
// here the entry names an event.
const DOCUMENT_EVENT: Record<CaseDocumentType, { title: string; tone: TimelineTone }> = {
  provider_response: { title: "Provider Response Received", tone: "done" },
  acknowledgement_letter: { title: "Acknowledgement Received", tone: "done" },
  follow_up_letter: { title: "Follow Up Letter Sent", tone: "done" },
  new_bill: { title: "Adjusted Bill Received", tone: "done" },
};

export function buildNegotiationTimeline({
  caseCreatedAt,
  letterSentAt,
  letterEvents,
  documents,
}: {
  caseCreatedAt: string | null;
  letterSentAt: string | null;
  letterEvents: LetterEvent[];
  documents: { type: string; created_at: string; received_on?: string | null }[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (caseCreatedAt) {
    entries.push({ title: "Case Opened", date: caseCreatedAt, tone: "done" });
  }
  if (letterSentAt) {
    entries.push({ title: "Negotiation Letter Sent", date: letterSentAt, tone: "done" });
  }

  // Only the first of each kind: Resend can report a delivery once and an
  // open many times, and a timeline listing nine opens tells the admin
  // less than one entry does. The open count lives on the customer's own
  // Active Case screen.
  const firstOf = (type: string) =>
    letterEvents
      .filter((e) => e.type === type)
      .map((e) => e.occurred_at)
      .sort()[0];

  const delivered = firstOf("email.delivered");
  if (delivered) entries.push({ title: "Letter Delivered", date: delivered, tone: "done" });

  const opened = firstOf("email.opened");
  if (opened) entries.push({ title: "Letter Opened", date: opened, tone: "done" });

  const bounced = firstOf("email.bounced") ?? firstOf("email.complained");
  if (bounced) {
    entries.push({
      title: "Delivery Failed",
      subtitle: "The provider's mail server rejected the letter",
      date: bounced,
      tone: "failed",
    });
  }

  for (const doc of documents) {
    const event = DOCUMENT_EVENT[doc.type as CaseDocumentType];
    if (!event) continue;
    entries.push({ title: event.title, date: doc.received_on ?? doc.created_at, tone: event.tone });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// What the case is waiting on, shown after the last real entry so the
// panel says something useful rather than just stopping.
export function describeNextStep({
  letterSentAt,
  entries,
}: {
  letterSentAt: string | null;
  entries: TimelineEntry[];
}): string | null {
  if (entries.some((e) => e.tone === "failed")) {
    return "The letter did not reach the provider — check the billing department email.";
  }
  if (!letterSentAt) return "Waiting for the appeal letter to be sent.";
  if (!entries.some((e) => e.title === "Provider Response Received")) {
    return "Waiting on the provider's response.";
  }
  return null;
}
