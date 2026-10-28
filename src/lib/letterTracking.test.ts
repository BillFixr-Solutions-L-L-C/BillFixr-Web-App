import { describe, expect, it } from "vitest";
import { summarizeLetterEvents, describeLetterTracking } from "./letterTracking";

const SENT_AT = "2026-10-20T10:00:00Z";
const open = (at: string) => ({ type: "email.opened", occurred_at: at });

describe("summarizeLetterEvents", () => {
  it("counts each open", () => {
    const t = summarizeLetterEvents(
      [{ type: "email.delivered", occurred_at: SENT_AT }, open("2026-10-21T09:00:00Z"), open("2026-10-22T11:00:00Z")],
      SENT_AT,
    );
    expect(t.openCount).toBe(2);
    expect(t.opened).toBe(true);
    expect(t.lastOpenedAt).toBe("2026-10-22T11:00:00Z");
  });

  it("takes the latest open regardless of the order events arrive in", () => {
    // Webhooks are not ordered, so the newest timestamp wins rather than
    // the last row seen.
    const t = summarizeLetterEvents([open("2026-10-22T11:00:00Z"), open("2026-10-21T09:00:00Z")], SENT_AT);
    expect(t.lastOpenedAt).toBe("2026-10-22T11:00:00Z");
  });

  it("separates delivered-but-unopened from opened", () => {
    const t = summarizeLetterEvents([{ type: "email.delivered", occurred_at: SENT_AT }], SENT_AT);
    expect(t.delivered).toBe(true);
    expect(t.opened).toBe(false);
    expect(describeLetterTracking(t)).toBe("Delivered");
  });

  it("does not claim the letter is unopened when no open was recorded", () => {
    // No open event means we did not observe one, not that nobody read
    // it: a blocked tracking pixel looks exactly the same. The copy must
    // not turn that silence into a claim.
    const t = summarizeLetterEvents([{ type: "email.delivered", occurred_at: SENT_AT }], SENT_AT);
    expect(describeLetterTracking(t)).not.toMatch(/not opened|unopened/i);
  });

  it("reports a bounce ahead of anything else", () => {
    const t = summarizeLetterEvents([{ type: "email.bounced", occurred_at: SENT_AT }], SENT_AT);
    expect(describeLetterTracking(t)).toBe("Delivery failed");
  });

  it("knows a letter was sent even before any event arrives", () => {
    const t = summarizeLetterEvents([], SENT_AT);
    expect(t.sent).toBe(true);
    expect(describeLetterTracking(t)).toBe("Sent");
  });

  it("says nothing was sent when nothing was", () => {
    const t = summarizeLetterEvents([], null);
    expect(t.sent).toBe(false);
    expect(describeLetterTracking(t)).toBe("Not sent yet");
  });

  it("reads naturally for a single open", () => {
    const t = summarizeLetterEvents([open("2026-10-21T09:00:00Z")], SENT_AT);
    expect(describeLetterTracking(t)).toBe("Opened once");
  });
});
