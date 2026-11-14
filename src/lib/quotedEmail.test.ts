import { describe, expect, it } from "vitest";

import { hasQuotedTail, stripQuotedTail } from "@/lib/quotedEmail";

describe("stripQuotedTail", () => {
  it("keeps a reply that quotes nothing", () => {
    expect(stripQuotedTail("Dispute accepted, new bill will be sent")).toBe(
      "Dispute accepted, new bill will be sent",
    );
  });

  it("cuts the attribution line Gmail writes, including when 'wrote:' wrapped", () => {
    // The real reply from production on 2026-11-13. "wrote:" is on its
    // own line because the client wrapped it.
    const body = [
      "Dispute accepted ,new bill will be sent",
      "",
      "Thanks",
      "",
      "On Fri, Nov 13, 2026, 8:44 PM BillFixr Advocate <advocate@billfixr.com>",
      "wrote:",
      "",
      "> **Formal Billing Dispute**",
      "> Account #0001000000121935",
    ].join("\n");
    expect(stripQuotedTail(body)).toBe("Dispute accepted ,new bill will be sent\n\nThanks");
    expect(hasQuotedTail(body)).toBe(true);
  });

  it("cuts at the first quoted line when there is no attribution", () => {
    expect(stripQuotedTail("We have adjusted it.\n\n> your letter said")).toBe("We have adjusted it.");
  });

  it("cuts Outlook's divider and its From: header", () => {
    expect(stripQuotedTail("Approved.\n\n-----Original Message-----\nFrom: advocate")).toBe("Approved.");
    expect(stripQuotedTail("Approved.\n\nFrom: advocate@billfixr.com\nSent: Friday")).toBe("Approved.");
  });

  it("does not take a reply's own body off when it opens with a date", () => {
    // "On 12 January..." is the provider talking, not a quote marker:
    // there is no "wrote:" anywhere near it.
    const body = "On 12 January the account was adjusted and the balance is now $112.49.";
    expect(stripQuotedTail(body)).toBe(body);
    expect(hasQuotedTail(body)).toBe(false);
  });

  it("keeps everything when trimming would leave nothing", () => {
    // A provider who replied inline, under the quote. Showing a blank
    // card would be worse than showing the thread.
    const body = "> our letter\n\nPlease see my answer above.";
    expect(stripQuotedTail(body)).toBe(body);
  });

  it("handles a Spanish client's attribution", () => {
    const body = "Recibido.\n\nEl vie, 13 nov 2026 a las 20:44, BillFixr escribió:\n> carta";
    expect(stripQuotedTail(body)).toBe("Recibido.");
  });
});
