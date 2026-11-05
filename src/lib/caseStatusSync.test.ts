import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncCaseFromNegotiation } from "@/lib/caseStatusSync";
import type { AutomationNegotiationStatus } from "@/types/automation-engine";

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail }));

type UpdateOutcome = { data: { id: string }[] | null; error: { message: string } | null };

// Minimal stand-in for the two calls the sync makes: a conditional update
// on cases, then a profiles lookup for the email address.
function adminClient(outcome: UpdateOutcome, profile: { name: string | null; email: string } | null) {
  const update = vi.fn();
  const client = {
    from(table: string) {
      if (table === "cases") {
        return {
          update(values: Record<string, unknown>) {
            update(values);
            const chain = {
              eq: () => chain,
              select: async () => outcome,
            };
            return chain;
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }),
      };
    },
  };
  return { client: client as never, update };
}

const CASE = { id: "case-1", user_id: "user-1", status: "awaiting_response" };
const PROFILE = { name: "Jane", email: "jane@example.com" };

describe("syncCaseFromNegotiation", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
  });

  it("advances the case and emails once when the provider has replied", async () => {
    const { client, update } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);

    const result = await syncCaseFromNegotiation(client, CASE, { status: "REPLY_RECEIVED" });

    expect(result).toEqual({ changed: true, from: "awaiting_response", to: "response_received", emailed: true });
    expect(update).toHaveBeenCalledWith({ status: "response_received" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
  });

  it("does nothing while the provider has not replied", async () => {
    const { client, update } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);

    const result = await syncCaseFromNegotiation(client, CASE, { status: "DISPATCHED" });

    expect(result).toEqual({ changed: false, reason: "no_response_yet" });
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never rewrites a case that is already past the response", async () => {
    // The failure this prevents: the engine settling a case and this
    // dragging it back to "the provider replied", losing paid/resolved.
    const { client, update } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);

    for (const status of ["response_received", "payment_pending", "resolved", "paid", "closed"]) {
      const result = await syncCaseFromNegotiation(client, { ...CASE, status }, { status: "COMPLETED" });
      expect(result).toEqual({ changed: false, reason: "status_not_advanceable" });
    }
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends no second email when a concurrent poll already advanced the case", async () => {
    // The update is conditional on the status we read, so the loser of the
    // race matches no row — which is what keeps this to one email.
    const { client } = adminClient({ data: [], error: null }, PROFILE);

    const result = await syncCaseFromNegotiation(client, CASE, { status: "REPLY_RECEIVED" });

    expect(result).toEqual({ changed: false, reason: "status_not_advanceable" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still reports the advance when the email fails", async () => {
    const { client } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);
    sendEmail.mockRejectedValue(new Error("resend down"));

    const result = await syncCaseFromNegotiation(client, CASE, { status: "HOSPITAL_ACCEPTED" });

    expect(result).toEqual({ changed: true, from: "awaiting_response", to: "response_received", emailed: false });
  });

  it("throws when the status write fails, so the caller can retry", async () => {
    const { client } = adminClient({ data: null, error: { message: "deadlock" } }, PROFILE);

    await expect(syncCaseFromNegotiation(client, CASE, { status: "REPLY_RECEIVED" })).rejects.toThrow("deadlock");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("advances from every pre-response status", async () => {
    for (const status of ["uploaded", "scanning", "analyzed", "letter_sent", "awaiting_response"]) {
      const { client } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);
      const result = await syncCaseFromNegotiation(client, { ...CASE, status }, { status: "REPLY_RECEIVED" });
      expect(result).toMatchObject({ changed: true, from: status });
    }
  });

  it("advances on every engine status that means the provider wrote back", async () => {
    const responded: AutomationNegotiationStatus[] = [
      "REPLY_RECEIVED",
      "COUNTER_OFFER_SENT",
      "COUNTER_OFFER_RECEIVED",
      "DISPUTE_ESCALATION",
      "PROVIDER_NO_ERROR",
      "FINANCIAL_ASSISTANCE_REQUIRED",
      "ITEMIZED_BILL_RECEIVED",
      "HOSPITAL_ACCEPTED",
      "HELD_FOR_REVIEW",
      "SETTLEMENT_AGREED",
      "AWAITING_COMPLETION_FEE",
      "COMPLETED",
    ];
    for (const status of responded) {
      const { client } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);
      const result = await syncCaseFromNegotiation(client, CASE, { status });
      expect(result, status).toMatchObject({ changed: true });
    }
  });

  it("stays put on every engine status that means nothing came back", async () => {
    const waiting: AutomationNegotiationStatus[] = [
      "DISPATCHED",
      "IN_REVIEW",
      "HIPAA_AUTH_PENDING",
      "CLOSED_NO_RESPONSE",
    ];
    for (const status of waiting) {
      const { client } = adminClient({ data: [{ id: "case-1" }], error: null }, PROFILE);
      const result = await syncCaseFromNegotiation(client, CASE, { status });
      expect(result, status).toEqual({ changed: false, reason: "no_response_yet" });
    }
  });
});
