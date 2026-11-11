import { describe, expect, it } from "vitest";

import { CADENCE_HOURS, MAX_FOLLOW_UPS, followUpDecision } from "@/lib/followUpCadence";
import type { AutomationMessage, AutomationNegotiation } from "@/types/automation-engine";

const NOW = new Date("2026-11-10T12:00:00Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function outbound(createdAt: string): AutomationMessage {
  return {
    id: `m-${createdAt}`,
    direction: "OUTBOUND",
    sender: "advocate@billfixr.com",
    recipient: "billing@hospital.test",
    subject: "Formal Billing Dispute",
    content_markdown: "...",
    status: "SENT",
    created_at: createdAt,
  };
}

function inbound(createdAt: string): AutomationMessage {
  return { ...outbound(createdAt), id: `in-${createdAt}`, direction: "INBOUND" };
}

function negotiation(
  overrides: Partial<Pick<AutomationNegotiation, "status" | "cadence_step" | "messages">> = {},
) {
  return {
    status: "DISPUTE_SENT" as AutomationNegotiation["status"],
    cadence_step: 0,
    messages: [outbound(hoursAgo(80))],
    ...overrides,
  };
}

describe("followUpDecision", () => {
  it("is due once the gap has elapsed", () => {
    expect(followUpDecision(negotiation(), NOW)).toEqual({ due: true, nextStep: 1 });
  });

  it("counts the next step from the follow-ups already sent", () => {
    expect(followUpDecision(negotiation({ cadence_step: 2 }), NOW)).toEqual({
      due: true,
      nextStep: 3,
    });
  });

  it("is not due before the gap has elapsed", () => {
    // The engine's tick endpoint does not check the clock, so without this
    // a daily cron would send a follow-up every day instead of every three.
    const decision = followUpDecision(
      negotiation({ messages: [outbound(hoursAgo(71))] }),
      NOW,
    );
    expect(decision).toEqual({ due: false, reason: "too_soon", hoursSinceLastSend: 71 });
  });

  it("is due exactly on the boundary", () => {
    expect(followUpDecision(negotiation({ messages: [outbound(hoursAgo(CADENCE_HOURS))] }), NOW))
      .toEqual({ due: true, nextStep: 1 });
  });

  it("never chases a provider that has replied", () => {
    // The worst failure mode this machinery has.
    expect(
      followUpDecision(
        negotiation({ status: "COUNTER_OFFER_RECEIVED" as AutomationNegotiation["status"] }),
        NOW,
      ),
    ).toEqual({ due: false, reason: "provider_responded" });
  });

  it("stops after the third follow-up", () => {
    expect(followUpDecision(negotiation({ cadence_step: MAX_FOLLOW_UPS }), NOW)).toEqual({
      due: false,
      reason: "follow_ups_exhausted",
    });
  });

  it("treats a missing cadence_step as none sent", () => {
    const rest = { status: negotiation().status, messages: negotiation().messages };
    expect(followUpDecision(rest as ReturnType<typeof negotiation>, NOW)).toEqual({
      due: true,
      nextStep: 1,
    });
  });

  it("does not follow up when nothing has been sent", () => {
    // A tick here would send "follow-up #1" to a provider that never
    // received the dispute letter.
    expect(followUpDecision(negotiation({ messages: [] }), NOW)).toEqual({
      due: false,
      reason: "nothing_sent_yet",
    });
  });

  it("ignores inbound messages when measuring the gap", () => {
    // An inbound message is not something we sent, so it must not reset the
    // clock — nor start it.
    expect(followUpDecision(negotiation({ messages: [inbound(hoursAgo(1))] }), NOW)).toEqual({
      due: false,
      reason: "nothing_sent_yet",
    });
  });

  it("measures from the newest outbound message, whatever order they arrive in", () => {
    // The list comes off the wire and its order is not part of the
    // contract, so the newest cannot be assumed to be last.
    const messages = [outbound(hoursAgo(10)), outbound(hoursAgo(200)), outbound(hoursAgo(90))];
    expect(followUpDecision(negotiation({ messages }), NOW)).toEqual({
      due: false,
      reason: "too_soon",
      hoursSinceLastSend: 10,
    });
  });

  it("resets the clock on anything we send, not just follow-ups", () => {
    // A counter-offer we sent yesterday means the provider has had one day,
    // not three — exactly as the engine's own loop treats it.
    const messages = [outbound(hoursAgo(100)), outbound(hoursAgo(24))];
    expect(followUpDecision(negotiation({ cadence_step: 1, messages }), NOW)).toMatchObject({
      due: false,
      reason: "too_soon",
    });
  });

  it("does not send off an unparseable date", () => {
    const messages = [{ ...outbound(hoursAgo(90)), created_at: "not a date" }];
    expect(followUpDecision(negotiation({ messages }), NOW)).toEqual({
      due: false,
      reason: "nothing_sent_yet",
    });
  });

  it("survives a null message in the list", () => {
    const messages = [null as unknown as AutomationMessage, outbound(hoursAgo(90))];
    expect(followUpDecision(negotiation({ messages }), NOW)).toEqual({ due: true, nextStep: 1 });
  });
});
