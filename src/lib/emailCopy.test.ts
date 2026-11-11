import { describe, expect, it } from "vitest";

import { emailCopy, fillCopy } from "@/lib/emailCopy";
import { SUPPORTED_LANGUAGES } from "@/lib/language";

const IDS = ["responseReceived", "closedNoResponse", "stillWaiting"] as const;

describe("emailCopy", () => {
  it("has every message in every language we write to customers in", () => {
    // A missing translation is how a Spanish-speaking customer gets a
    // half-English email, which reads worse than a wholly English one.
    for (const id of IDS) {
      for (const language of SUPPORTED_LANGUAGES) {
        const copy = emailCopy(id, language);
        expect(copy.subject.trim(), `${id}.${language}.subject`).not.toBe("");
        expect(copy.heading.trim(), `${id}.${language}.heading`).not.toBe("");
        expect(copy.body.trim(), `${id}.${language}.body`).not.toBe("");
        expect(copy.cta.trim(), `${id}.${language}.cta`).not.toBe("");
      }
    }
  });

  it("actually differs between languages", () => {
    // Guards against a copy-paste that leaves the English in the Spanish
    // slot -- which would pass the "not empty" test above.
    for (const id of IDS) {
      expect(emailCopy(id, "es").body, id).not.toBe(emailCopy(id, "en").body);
      expect(emailCopy(id, "es").subject, id).not.toBe(emailCopy(id, "en").subject);
    }
  });

  it("keeps the placeholders the English has", () => {
    // A translation that drops {filename} silently loses the one detail
    // that tells the customer which bill this is about.
    for (const id of IDS) {
      const english = emailCopy(id, "en").body.match(/\{\w+\}/g) ?? [];
      const spanish = emailCopy(id, "es").body.match(/\{\w+\}/g) ?? [];
      expect(spanish.sort(), id).toEqual(english.sort());
    }
  });

  it("falls back to English for a language we have not written", () => {
    // Better a readable email in the wrong language than an empty one.
    expect(emailCopy("stillWaiting", "fr" as never).body).toBe(emailCopy("stillWaiting", "en").body);
  });
});

describe("fillCopy", () => {
  it("substitutes a placeholder", () => {
    expect(fillCopy("about {filename}.", { filename: "bill.pdf" })).toBe("about bill.pdf.");
  });

  it("leaves an unknown placeholder alone rather than blanking it", () => {
    // Printing "{total}" is a visible bug someone reports. Printing
    // nothing is a sentence with a hole in it that nobody notices.
    expect(fillCopy("you owe {total}.", { filename: "x" })).toBe("you owe {total}.");
  });

  it("does not escape, because it does not know where the text is going", () => {
    // Stated as a test so nobody adds escaping here and double-escapes in
    // the HTML templates, which already escape at the call site.
    expect(fillCopy("{filename}", { filename: "a&b<c>" })).toBe("a&b<c>");
  });
});
