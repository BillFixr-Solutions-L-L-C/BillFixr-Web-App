export type LetterEvent = { type: string; occurred_at: string };

export type LetterTracking = {
  sent: boolean;
  delivered: boolean;
  opened: boolean;
  openCount: number;
  lastOpenedAt: string | null;
  bounced: boolean;
};

// Derived by counting events rather than reading a counter, so a webhook
// Resend redelivers cannot inflate the number of opens.
//
// Note on "Forwarded", which Figma 815:3326 shows beside "Opened": email
// tracking cannot detect forwarding. A pixel load tells you an image was
// fetched, not who by. It is deliberately not shown rather than guessed at
// from, say, opens arriving from different clients.
export function summarizeLetterEvents(events: LetterEvent[], sentAt: string | null): LetterTracking {
  const opens = events.filter((e) => e.type === "email.opened");
  const lastOpenedAt = opens.reduce<string | null>(
    (latest, e) => (latest === null || e.occurred_at > latest ? e.occurred_at : latest),
    null,
  );

  return {
    sent: Boolean(sentAt) || events.some((e) => e.type === "email.sent"),
    delivered: events.some((e) => e.type === "email.delivered"),
    opened: opens.length > 0,
    openCount: opens.length,
    lastOpenedAt,
    bounced: events.some((e) => e.type === "email.bounced" || e.type === "email.complained"),
  };
}

// What the customer is told. Every state here is something we actually
// observed; none of it asserts an absence.
//
// This used to say "Delivered, not opened yet", which we cannot support.
// An open is only ever detected by a 1x1 pixel loading, and hospital and
// insurer mail clients block remote images by default — so a provider who
// read the letter closely still produces no open event. Claiming they
// hadn't opened it would be wrong far more often than right, and the
// customer might chase a provider who had in fact already replied.
// "Delivered" is the whole of what we know. Same reasoning as leaving out
// "Forwarded" (see summarizeLetterEvents).
export function describeLetterTracking(t: LetterTracking): string {
  if (!t.sent) return "Not sent yet";
  if (t.bounced) return "Delivery failed";
  if (t.opened) {
    return t.openCount === 1 ? "Opened once" : `Opened ${t.openCount} times`;
  }
  if (t.delivered) return "Delivered";
  return "Sent";
}

// What the team is told about whether the provider read the letter.
//
// This is the question the business actually cares about, and email cannot
// answer it directly: see describeLetterTracking for why an open event is
// both deliberately disabled and unreliable when enabled. So rather than
// present an "Opened" figure that is really "a tracking pixel loaded", the
// admin view is ranked by evidential strength:
//
//   replied   — the provider answered. Proof they read it, and the only
//               proof email can ever supply.
//   delivered — their mail server accepted it. Proof it arrived, and
//               nothing at all about whether a person looked at it.
//   failed    — it did not arrive. Actionable: the address is wrong.
//   sent      — we handed it to the mail provider and heard nothing back.
//
// An open event, if one ever arrives, is reported — but below a reply,
// never as a substitute for one.
export type ProviderEngagement = {
  state: "replied" | "opened" | "delivered" | "failed" | "sent" | "not-sent";
  headline: string;
  /** What that state does and does not prove, in a line. */
  caveat: string;
  tone: "done" | "waiting" | "failed";
};

export function describeProviderEngagement({
  tracking,
  repliedAt,
}: {
  tracking: LetterTracking;
  /** When a provider response was logged on the case, if one was. */
  repliedAt: string | null;
}): ProviderEngagement {
  if (repliedAt) {
    return {
      state: "replied",
      headline: "The provider replied",
      caveat: "A reply is the only proof of reading that email can give. They read it.",
      tone: "done",
    };
  }
  if (!tracking.sent) {
    return {
      state: "not-sent",
      headline: "Not sent yet",
      caveat: "Nothing has gone to the provider, so there is nothing to track.",
      tone: "waiting",
    };
  }
  if (tracking.bounced) {
    return {
      state: "failed",
      headline: "Delivery failed",
      caveat: "The provider's mail server rejected it — check the billing department address.",
      tone: "failed",
    };
  }
  if (tracking.opened) {
    return {
      state: "opened",
      headline: tracking.openCount === 1 ? "Opened once" : `Opened ${tracking.openCount} times`,
      caveat: "An open means an image in the letter loaded. It is evidence, not proof.",
      tone: "done",
    };
  }
  if (tracking.delivered) {
    return {
      state: "delivered",
      headline: "Delivered, no reply yet",
      caveat:
        "Delivered means their mail server accepted it. Whether anyone has read it cannot be known until they reply.",
      tone: "waiting",
    };
  }
  return {
    state: "sent",
    headline: "Sent, delivery unconfirmed",
    caveat: "Handed to the mail provider, which has not yet reported delivery.",
    tone: "waiting",
  };
}
