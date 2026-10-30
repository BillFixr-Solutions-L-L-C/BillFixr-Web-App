import { describe, expect, it } from "vitest";
import { buildNegotiationTimeline, describeNextStep } from "./negotiationTimeline";

const OPENED = "2026-10-01T09:00:00Z";
const SENT = "2026-10-02T09:00:00Z";

const build = (over: Partial<Parameters<typeof buildNegotiationTimeline>[0]> = {}) =>
  buildNegotiationTimeline({
    caseCreatedAt: OPENED,
    letterSentAt: SENT,
    letterEvents: [],
    documents: [],
    ...over,
  });

describe("buildNegotiationTimeline", () => {
  it("is empty when nothing has happened", () => {
    expect(buildNegotiationTimeline({ caseCreatedAt: null, letterSentAt: null, letterEvents: [], documents: [] })).toEqual([]);
  });

  it("records the case opening and the letter going out", () => {
    expect(build().map((e) => e.title)).toEqual(["Case Opened", "Negotiation Letter Sent"]);
  });

  it("orders entries by when they happened, not the order they were assembled in", () => {
    // Documents are appended last but can predate a letter event, so the
    // sort has to be real rather than incidental.
    const entries = build({
      letterEvents: [{ type: "email.delivered", occurred_at: "2026-10-09T09:00:00Z" }],
      documents: [{ type: "provider_response", created_at: "2026-10-05T09:00:00Z" }],
    });
    expect(entries.map((e) => e.title)).toEqual([
      "Case Opened",
      "Negotiation Letter Sent",
      "Provider Response Received",
      "Letter Delivered",
    ]);
  });

  it("collapses repeated opens into one entry", () => {
    // Resend reports an open every time the pixel loads. Nine entries
    // saying "Letter Opened" would bury the rest of the story.
    const entries = build({
      letterEvents: [
        { type: "email.opened", occurred_at: "2026-10-04T09:00:00Z" },
        { type: "email.opened", occurred_at: "2026-10-05T09:00:00Z" },
        { type: "email.opened", occurred_at: "2026-10-06T09:00:00Z" },
      ],
    });
    const opens = entries.filter((e) => e.title === "Letter Opened");
    expect(opens).toHaveLength(1);
    expect(opens[0].date).toBe("2026-10-04T09:00:00Z");
  });

  it("marks a bounce as a failure rather than another step", () => {
    const entries = build({ letterEvents: [{ type: "email.bounced", occurred_at: "2026-10-03T09:00:00Z" }] });
    const failure = entries.find((e) => e.tone === "failed");
    expect(failure?.title).toBe("Delivery Failed");
  });

  it("names each kind of document by what its arrival means", () => {
    const entries = build({
      documents: [
        { type: "provider_response", created_at: "2026-10-03T09:00:00Z" },
        { type: "acknowledgement_letter", created_at: "2026-10-04T09:00:00Z" },
        { type: "follow_up_letter", created_at: "2026-10-05T09:00:00Z" },
        { type: "new_bill", created_at: "2026-10-06T09:00:00Z" },
      ],
    });
    expect(entries.map((e) => e.title)).toEqual([
      "Case Opened",
      "Negotiation Letter Sent",
      "Provider Response Received",
      "Acknowledgement Received",
      "Follow Up Letter Sent",
      "Adjusted Bill Received",
    ]);
  });

  it("prefers the date the document was received over when it was uploaded", () => {
    // Staff upload a provider's letter days after it arrived; the
    // timeline should say when it arrived.
    const entries = build({
      documents: [{ type: "provider_response", created_at: "2026-10-20T09:00:00Z", received_on: "2026-10-04T09:00:00Z" }],
    });
    expect(entries.find((e) => e.title === "Provider Response Received")?.date).toBe("2026-10-04T09:00:00Z");
  });

  it("ignores a document type it has no event for", () => {
    const entries = build({ documents: [{ type: "something_new", created_at: "2026-10-03T09:00:00Z" }] });
    expect(entries.map((e) => e.title)).toEqual(["Case Opened", "Negotiation Letter Sent"]);
  });
});

describe("describeNextStep", () => {
  it("points at the billing address when delivery failed", () => {
    const entries = build({ letterEvents: [{ type: "email.bounced", occurred_at: "2026-10-03T09:00:00Z" }] });
    expect(describeNextStep({ letterSentAt: SENT, entries })).toMatch(/did not reach the provider/);
  });

  it("says the letter still has to go out", () => {
    expect(describeNextStep({ letterSentAt: null, entries: [] })).toMatch(/appeal letter to be sent/);
  });

  it("says we are waiting on the provider once it has", () => {
    expect(describeNextStep({ letterSentAt: SENT, entries: build() })).toMatch(/provider's response/);
  });

  it("says nothing once the provider has responded", () => {
    const entries = build({ documents: [{ type: "provider_response", created_at: "2026-10-03T09:00:00Z" }] });
    expect(describeNextStep({ letterSentAt: SENT, entries })).toBeNull();
  });
});
