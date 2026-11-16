import { describe, expect, it } from "vitest";
import {
  agreedSavings,
  canCloseForNoResponse,
  clientNotices,
  describeNegotiationStatus,
  patientBalance,
} from "./negotiationStatus";
import { isCaseCompleted } from "./caseStatus";
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

  it("says they owe US nothing further, and that the provider's bill still stands", () => {
    // The engine closes these itself, and a customer seeing "closed" with
    // no explanation would reasonably assume they still owe a fee. This
    // used to say a bare "You owe nothing", which solves that and creates
    // a worse problem: someone whose provider ignored the dispute could
    // read it as their medical bill being cancelled. The success fee is a
    // share of the reduction, so silence means no fee -- and nothing at
    // all about what the hospital is owed.
    const { detail, tone } = describeNegotiationStatus("CLOSED_NO_RESPONSE");
    expect(detail).toMatch(/owe us nothing further/i);
    expect(detail).toMatch(/bill from the provider still stands/i);
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

  // The first real settlement, from production on 2026-11-13. A $1,818.13
  // bill where insurance had already paid all but $428.53, settled at
  // $112.49.
  it("measures against what the patient owed, not the gross bill", () => {
    expect(
      agreedSavings({ total_billed: 1818.13, original_balance_due: 428.53, settled_amount: 112.49 }),
    ).toBe(316.04);
  });

  it("does not report a saving larger than the bill the customer was holding", () => {
    // The old sum gave $1,705.64 here and put it on the customer's screen
    // as "saved". The success fee is a share of this number, so at 20% it
    // would have invoiced $341 against a $316 reduction -- more than the
    // whole saving.
    const saving = agreedSavings({ total_billed: 1818.13, original_balance_due: 428.53, settled_amount: 112.49 })!;
    expect(saving).toBeLessThan(428.53);
    expect(saving).not.toBe(1705.64);
  });

  it("rounds to the cent, because a Stripe charge is computed from it", () => {
    // 428.53 - 112.49 is 316.04000000000002 in binary floating point,
    // which reaches the customer as "$316.04000000000002 saved" and the
    // fee as a fraction of a cent nobody can reconcile.
    const saving = agreedSavings({ total_billed: 1818.13, original_balance_due: 428.53, settled_amount: 112.49 })!;
    expect(saving.toString()).toBe("316.04");
  });

  it("falls back to the gross bill only when the balance is missing", () => {
    // A negotiation created before the engine recorded the field. The old
    // behaviour, kept where there is nothing better -- never preferred.
    expect(agreedSavings({ total_billed: 10000, original_balance_due: null, settled_amount: 7000 })).toBe(3000);
    expect(agreedSavings({ total_billed: 10000, original_balance_due: 0, settled_amount: 7000 })).toBe(3000);
  });
});

describe("patientBalance", () => {
  it("prefers what the patient owed", () => {
    expect(patientBalance({ total_billed: 1818.13, original_balance_due: 428.53 })).toBe(428.53);
  });

  it("falls back to the gross bill when there is no balance recorded", () => {
    expect(patientBalance({ total_billed: 1818.13, original_balance_due: null })).toBe(1818.13);
    expect(patientBalance({ total_billed: 1818.13, original_balance_due: undefined })).toBe(1818.13);
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

// One rule, used by the admin screen to decide whether to offer the
// button and by the route to enforce it. The engine applies no guard of
// its own: POST /no-response/close closes whatever it is handed.
describe("canCloseForNoResponse", () => {
  const silent = { status: "DISPATCHED" as const, cadence_step: 3 };

  it("allows a close once all three follow-ups have gone unanswered", () => {
    expect(canCloseForNoResponse(silent, "awaiting_response", isCaseCompleted)).toEqual({
      closable: true,
      followUpsSent: 3,
    });
  });

  it("refuses while the sequence is still running", () => {
    // Giving up on a provider that was merely slow.
    expect(canCloseForNoResponse({ ...silent, cadence_step: 2 }, "awaiting_response", isCaseCompleted)).toEqual({
      closable: false,
      reason: "follow_ups_incomplete",
      followUpsSent: 2,
    });
  });

  it("refuses on every status that means the provider did reply", () => {
    // Closing one of these would tell the customer they were ignored
    // when they were not.
    for (const status of ["REPLY_RECEIVED", "COUNTER_OFFER_RECEIVED", "HOSPITAL_ACCEPTED", "SETTLEMENT_AGREED"] as const) {
      expect(canCloseForNoResponse({ status, cadence_step: 3 }, "awaiting_response", isCaseCompleted)).toMatchObject({
        closable: false,
        reason: "provider_responded",
      });
    }
  });

  it("refuses a case that is already finished", () => {
    expect(canCloseForNoResponse(silent, "paid", isCaseCompleted)).toMatchObject({
      closable: false,
      reason: "already_finished",
    });
    expect(
      canCloseForNoResponse({ status: "CLOSED_NO_RESPONSE", cadence_step: 3 }, "awaiting_response", isCaseCompleted),
    ).toMatchObject({ closable: false, reason: "already_finished" });
  });

  it("treats a missing or unreadable cadence as nothing sent", () => {
    expect(
      canCloseForNoResponse({ status: "DISPATCHED", cadence_step: undefined as never }, "awaiting_response", isCaseCompleted),
    ).toEqual({ closable: false, reason: "follow_ups_incomplete", followUpsSent: 0 });
    expect(
      canCloseForNoResponse({ status: "DISPATCHED", cadence_step: Number.NaN }, "awaiting_response", isCaseCompleted),
    ).toEqual({ closable: false, reason: "follow_ups_incomplete", followUpsSent: 0 });
  });
});
