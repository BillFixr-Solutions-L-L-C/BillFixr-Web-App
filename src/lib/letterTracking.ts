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

// What the customer is told. Deliberately plain: "not opened" is a real,
// useful state, and silence about it would read as though we had no idea.
export function describeLetterTracking(t: LetterTracking): string {
  if (!t.sent) return "Not sent yet";
  if (t.bounced) return "Delivery failed";
  if (t.opened) {
    return t.openCount === 1 ? "Opened once" : `Opened ${t.openCount} times`;
  }
  if (t.delivered) return "Delivered, not opened yet";
  return "Sent";
}
