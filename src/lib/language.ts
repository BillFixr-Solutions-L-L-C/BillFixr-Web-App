// Who gets written to in which language.
//
// There are two languages in this product and they are not the same thing:
//
//   * the DISPLAY language -- what the website is rendered in. A
//     preference, changed from the menu whenever the customer likes, kept
//     in a cookie.
//   * the COMMUNICATION language -- what BillFixr writes TO the customer
//     in: emails, case notices, and the AI's explanation of what a
//     hospital said. Fixed at registration from the language they chose on
//     their first visit, stored on the profile, and never moved by the
//     display switcher.
//
// A customer who flips the site to English to read a page still gets their
// case correspondence in Spanish. That is the requirement, and keeping the
// two in separate stores is what makes it true rather than hopefully true.
//
// And one rule that does not bend: everything addressed to a HOSPITAL is
// in English, whoever the customer is. A dispute letter, a follow-up, a
// counter-offer, a revised-bill request -- all English. So is every
// document that comes back: the hospital's reply and the corrected bill
// stay in the language they were written in, and are never translated in
// place. Only our explanation OF them is translated.

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/**
 * The language of everything addressed to a provider.
 *
 * A constant, not a parameter, and deliberately not derived from anyone's
 * preference. US hospital billing offices work in English; a dispute sent
 * in Spanish is likelier to be set aside than actioned, and the statutes
 * these letters cite are written in English. There is no code path that
 * should be able to change this, so there is no argument to change it
 * with.
 */
export const HOSPITAL_LANGUAGE: Language = "en";

/** The cookie holding the language chosen before anyone has registered. */
export const FIRST_VISIT_LANGUAGE_COOKIE = "bf_lang_chosen";
/** The cookie holding the display preference, which may change freely. */
export const DISPLAY_LANGUAGE_COOKIE = "bf_lang_display";

/**
 * Narrows anything to a supported language, falling back to English.
 *
 * Used on every boundary -- a cookie, a form field, a database row, an
 * engine response -- because every one of them can carry a value this
 * code did not write. An unrecognised language must never fail a
 * registration or a send; it becomes English, which every hospital-facing
 * document is already in.
 */
export function asLanguage(value: unknown): Language {
  if (typeof value !== "string") return DEFAULT_LANGUAGE;
  const normalized = value.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as Language)
    : DEFAULT_LANGUAGE;
}

/**
 * The language to write to this customer in.
 *
 * Takes the profile, never the display cookie. Passing the cookie here
 * would reintroduce exactly the bug this module exists to prevent: a
 * customer reads one page in English and their case correspondence
 * silently switches language.
 */
export function customerLanguage(
  profile: { communication_language?: string | null } | null | undefined,
): Language {
  return asLanguage(profile?.communication_language);
}

/**
 * The language a new registration should be recorded with.
 *
 * `chosen` is the first-visit cookie. `displayed` is what the site happens
 * to be showing at the moment they sign up, used only when there is no
 * first-visit value -- someone who registers on a different device from
 * the one they first browsed on has no cookie to carry across, and the
 * language in front of them is a better guess than English.
 */
export function registrationLanguage(chosen: unknown, displayed?: unknown): Language {
  if (typeof chosen === "string" && chosen.trim()) return asLanguage(chosen);
  return asLanguage(displayed);
}

/**
 * Whether a piece of text is for a provider rather than the customer.
 *
 * Exists so the choice is made by naming the audience, not by remembering
 * to pass "en". `languageFor("hospital")` cannot be got wrong; a bare
 * string argument can.
 */
export type Audience = "customer" | "hospital";

export function languageFor(
  audience: Audience,
  profile?: { communication_language?: string | null } | null,
): Language {
  return audience === "hospital" ? HOSPITAL_LANGUAGE : customerLanguage(profile);
}
