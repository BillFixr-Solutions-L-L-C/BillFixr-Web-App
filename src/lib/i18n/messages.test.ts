import { describe, expect, it } from "vitest";

import { MESSAGES, translate } from "@/lib/i18n/messages";
import { SUPPORTED_LANGUAGES } from "@/lib/language";

describe("the dictionary", () => {
  it("has every key in every language", () => {
    // A missing key renders as the key itself -- "nav.dashboard" on a
    // sidebar. Loud, but better caught here.
    const english = Object.keys(MESSAGES.en).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(MESSAGES[language]).sort(), language).toEqual(english);
    }
  });

  it("has no untranslated Spanish left as English", () => {
    // Catches a copy-paste that leaves the English in the Spanish slot.
    // A handful of strings are legitimately identical in both -- the
    // language names themselves, and "Email" -- so those are named rather
    // than the rule being weakened.
    const identicalOnPurpose = new Set(["lang.en", "lang.es", "info.email"]);
    const same = (Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]).filter(
      (key) => !identicalOnPurpose.has(key) && MESSAGES.en[key] === MESSAGES.es[key],
    );
    expect(same).toEqual([]);
  });

  it("keeps the placeholders the English has", () => {
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]) {
      const english = (MESSAGES.en[key].match(/\{\w+\}/g) ?? []).sort();
      const spanish = (MESSAGES.es[key].match(/\{\w+\}/g) ?? []).sort();
      expect(spanish, key).toEqual(english);
    }
  });
});

describe("translate", () => {
  it("returns the string for the language asked for", () => {
    expect(translate("en", "nav.dashboard")).toBe("Dashboard");
    expect(translate("es", "nav.dashboard")).toBe("Panel");
  });

  it("fills placeholders", () => {
    expect(translate("en", "table.errorsFound", { count: 2 })).toBe("2 found");
    expect(translate("es", "table.errorsFound", { count: 2 })).toBe("2 encontrados");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    expect(translate("en", "table.errorsFound")).toContain("{count}");
  });

  it("falls back to English for a language it does not have", () => {
    expect(translate("fr" as never, "nav.support")).toBe("Support");
  });

  it("returns the key for a key that does not exist, rather than nothing", () => {
    // Visible and obviously wrong beats an empty element nobody notices.
    expect(translate("en", "no.such.key" as never)).toBe("no.such.key");
  });
});
