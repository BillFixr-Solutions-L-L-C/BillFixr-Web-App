import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANGUAGE,
  HOSPITAL_LANGUAGE,
  asLanguage,
  customerLanguage,
  languageFor,
  registrationLanguage,
} from "@/lib/language";

// Two languages that are not the same thing: what the website is rendered
// in, which changes whenever the customer likes, and what BillFixr writes
// TO them in, which is fixed at registration. The requirement is that
// flipping the first never moves the second.

describe("asLanguage", () => {
  it("takes the languages we support", () => {
    expect(asLanguage("en")).toBe("en");
    expect(asLanguage("es")).toBe("es");
  });

  it("accepts a regional tag", () => {
    // A browser or a cookie may carry es-MX or es_419; the language is
    // still Spanish.
    expect(asLanguage("es-MX")).toBe("es");
    expect(asLanguage("es_419")).toBe("es");
    expect(asLanguage("EN-GB")).toBe("en");
  });

  it("falls back to English rather than failing", () => {
    // These values arrive from cookies, form fields and database rows --
    // every one of them can hold something this code did not write. An
    // unrecognised language must never fail a registration or a send.
    for (const value of [null, undefined, "", "   ", "fr", "klingon", 42, {}, []]) {
      expect(asLanguage(value)).toBe(DEFAULT_LANGUAGE);
    }
  });
});

describe("customerLanguage", () => {
  it("reads the profile", () => {
    expect(customerLanguage({ communication_language: "es" })).toBe("es");
  });

  it("is English for a profile recorded before this existed", () => {
    expect(customerLanguage({})).toBe("en");
    expect(customerLanguage(null)).toBe("en");
    expect(customerLanguage({ communication_language: null })).toBe("en");
  });
});

describe("the hospital always gets English", () => {
  it("is a constant, not a preference", () => {
    expect(HOSPITAL_LANGUAGE).toBe("en");
  });

  it("stays English for a Spanish-speaking customer", () => {
    // The requirement, stated as a test: a dispute letter is English
    // whoever the customer is. US billing offices work in English and the
    // statutes these letters cite are written in it.
    const spanish = { communication_language: "es" };
    expect(languageFor("hospital", spanish)).toBe("en");
    expect(languageFor("customer", spanish)).toBe("es");
  });

  it("takes no argument that could change it", () => {
    // languageFor("hospital") ignores the profile entirely. If this ever
    // starts depending on it, this test is the thing that notices.
    expect(languageFor("hospital", { communication_language: "es" })).toBe(
      languageFor("hospital", { communication_language: "en" }),
    );
    expect(languageFor("hospital", null)).toBe("en");
  });
});

describe("registrationLanguage", () => {
  it("uses the language chosen on the first visit", () => {
    expect(registrationLanguage("es", "en")).toBe("es");
  });

  it("prefers the first-visit choice over whatever the site is showing now", () => {
    // The whole point. Someone who arrived in Spanish and later switched
    // the site to English still registers as a Spanish speaker.
    expect(registrationLanguage("es", "en")).toBe("es");
    expect(registrationLanguage("en", "es")).toBe("en");
  });

  it("falls back to the displayed language when there is no first-visit choice", () => {
    // Registering on a different device from the one they first browsed
    // on: there is no cookie to carry across, and the language in front of
    // them is a better guess than English.
    expect(registrationLanguage(null, "es")).toBe("es");
    expect(registrationLanguage("", "es")).toBe("es");
    expect(registrationLanguage("   ", "es")).toBe("es");
  });

  it("is English when neither is known", () => {
    expect(registrationLanguage(null, null)).toBe("en");
    expect(registrationLanguage(undefined, undefined)).toBe("en");
  });
});
