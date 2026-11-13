import { describe, expect, it } from "vitest";

import { describeNegotiationStatus } from "@/lib/negotiationStatus";
import { SUMMARIES_ES } from "@/lib/negotiationStatus.es";
import type { AutomationNegotiationStatus } from "@/types/automation-engine";

// The requirement: when a hospital responds, our account of that response
// reaches the customer in the language they chose at registration -- while
// the reply itself, the letters we send and the corrected bill stay
// English.
//
// This is where that lands. The engine reduces a provider's reply to a
// status; this sentence is what the customer reads about it.

const ALL = Object.keys(SUMMARIES_ES) as AutomationNegotiationStatus[];

describe("a provider's response, explained in Spanish", () => {
  it("covers every status the English covers", () => {
    // A status with no Spanish falls back to English, which is readable
    // but is not what was asked for. Better caught here.
    for (const status of ALL) {
      expect(describeNegotiationStatus(status, "es").detail, status).toBe(SUMMARIES_ES[status].detail);
    }
  });

  it("says something different from the English", () => {
    for (const status of ALL) {
      expect(describeNegotiationStatus(status, "es").detail, status).not.toBe(
        describeNegotiationStatus(status, "en").detail,
      );
    }
  });

  it("defaults to English when no language is given", () => {
    expect(describeNegotiationStatus("DISPATCHED").detail).toMatch(/billing department/i);
  });

  it("keeps the tone from the English entry", () => {
    // Tone drives the colour of the badge. It comes from one place so the
    // two languages cannot disagree about whether a state is good or bad.
    for (const status of ALL) {
      expect(describeNegotiationStatus(status, "es").tone, status).toBe(
        describeNegotiationStatus(status, "en").tone,
      );
    }
  });

  it("falls back to English for a status the engine has added but we have not", () => {
    const unknown = describeNegotiationStatus("SOMETHING_NEW", "es");
    expect(unknown.detail).toBe("We're working on this case.");
    expect(unknown.tone).toBe("working");
  });
});

describe("the fee sentence says which debt it means", () => {
  // The most consequential sentence on the screen. The success fee is a
  // share of the reduction, so silence from the provider produces no fee
  // -- but a customer reading a bare "You owe nothing" could conclude
  // their medical bill had been cancelled, which is the opposite of true.
  it("is explicit in English", () => {
    const detail = describeNegotiationStatus("CLOSED_NO_RESPONSE", "en").detail;
    expect(detail).toContain("owe us nothing further");
    expect(detail).toMatch(/bill from the provider still stands/i);
  });

  it("is explicit in Spanish too", () => {
    const detail = describeNegotiationStatus("CLOSED_NO_RESPONSE", "es").detail;
    expect(detail).toContain("No nos debe nada más");
    expect(detail).toMatch(/sigue vigente/i);
  });

  it("never says the bare, ambiguous version in either language", () => {
    for (const language of ["en", "es"] as const) {
      const detail = describeNegotiationStatus("CLOSED_NO_RESPONSE", language).detail;
      expect(detail).not.toMatch(/closed this case\.\s*You owe nothing\.\s*$/i);
      expect(detail).not.toMatch(/cerramos el caso\.\s*No nos debe nada\.\s*$/i);
    }
  });
});
