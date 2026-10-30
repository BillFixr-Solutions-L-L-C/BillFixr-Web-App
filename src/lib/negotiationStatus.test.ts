import { describe, expect, it } from "vitest";
import { agreedSavings, clientNotices, describeNegotiationStatus } from "./negotiationStatus";
import type { AutomationNegotiationStatus } from "@/types/automation-engine";

// Every status the engine can report. Kept as a literal list so adding
// one to the type without teaching this file shows up as a failure here
// rather than as "In progress" in front of a customer.
const ALL: AutomationNegotiationStatus[] = [
  "DISPATCHED",
  "IN_REVIEW",
  "REPLY_RECEIVED",
  "COUNTER_OFFER_SENT",
  "COUNTER_OFFER_RECEIVED",
  "DISPUTE_ESCALATION",
  "PROVIDER_NO_ERROR",
  "FINANCIAL_ASSISTANCE_REQUIRED",
  "ITEMIZED_BILL_RECEIVED",
  "HIPAA_AUTH_PENDING",
  "HOSPITAL_ACCEPTED",
  "HELD_FOR_REVIEW",
  "SETTLEMENT_AGREED",
  "AWAITING_COMPLETION_FEE",
  "COMPLETED",
  "CLOSED_NO_RESPONSE",
];

describe("describeNegotiationStatus", () => {
  it("has its own wording for every status the engine can report", () => {
    const fallback = describeNegotiationStatus("SOMETHING_NEW");
    for (const status of ALL) {
      const summary = describeNegotiationStatus(status);
      expect(summary.label, status).not.toBe(fallback.label);
      expect(summary.detail.length, status).toBeGreaterThan(20);
    }
  });

  it("never shows the engine's own status name to a customer", () => {
    for (const status of ALL) {
      const { label, detail } = describeNegotiationStatus(status);
      expect(`${label} ${detail}`, status).not.toContain(status);
      expect(`${label} ${detail}`, status).not.toMatch(/_/);
    }
  });

  it("tells the customer they owe nothing when nobody replied", () => {
    // The engine closes these itself, and a customer seeing "closed"
    // with no explanation would reasonably assume they still owe a fee.
    const { detail, tone } = describeNegotiationStatus("CLOSED_NO_RESPONSE");
    expect(detail).toMatch(/owe nothing/i);
    expect(tone).toBe("attention");
  });

  it("does not call a case good news while it needs something from the customer", () => {
    for (const status of ["HIPAA_AUTH_PENDING", "FINANCIAL_ASSISTANCE_REQUIRED", "PROVIDER_NO_ERROR"] as const) {
      expect(describeNegotiationStatus(status).tone, status).toBe("attention");
    }
  });

  it("falls back without inventing progress for an unknown status", () => {
    const summary = describeNegotiationStatus("WHAT_IS_THIS");
    expect(summary.label).toBe("In progress");
    expect(summary.tone).toBe("working");
  });
});

describe("agreedSavings", () => {
  it("reports what the provider agreed to, not the audit estimate", () => {
    expect(agreedSavings({ total_billed: 10000, settled_amount: 7000 })).toBe(3000);
  });

  it("is null before a settlement exists", () => {
    expect(agreedSavings({ total_billed: 10000, settled_amount: null })).toBeNull();
  });

  it("is null rather than negative if a settlement came back higher", () => {
    expect(agreedSavings({ total_billed: 5000, settled_amount: 6000 })).toBeNull();
  });
});

describe("clientNotices", () => {
  it("keeps only the notices meant for the client", () => {
    const messages = [
      { id: "1", direction: "OUTBOUND" as const, sender: "", recipient: "", subject: "", content_markdown: "a", status: "", created_at: "" },
      { id: "2", direction: "SYSTEM" as const, sender: "", recipient: "", subject: "", content_markdown: "b", status: "", created_at: "" },
      { id: "3", direction: "INBOUND" as const, sender: "", recipient: "", subject: "", content_markdown: "c", status: "", created_at: "" },
    ];
    expect(clientNotices({ messages }).map((m) => m.id)).toEqual(["2"]);
  });

  it("handles a negotiation with no messages", () => {
    expect(clientNotices({ messages: [] })).toEqual([]);
  });
});
