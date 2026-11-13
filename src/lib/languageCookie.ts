"use client";

import {
  DISPLAY_LANGUAGE_COOKIE,
  FIRST_VISIT_LANGUAGE_COOKIE,
  asLanguage,
  type Language,
} from "@/lib/language";

// Reading and writing the two language cookies from the browser.
//
// Separate from src/lib/language.ts on purpose: that module holds the
// rules and runs on both sides, this one touches `document` and so can
// only run in a browser. Keeping the rules server-safe is what lets the
// signup trigger, the email senders and the UI all agree about which
// language applies without importing anything that needs a DOM.

// A year. Long enough that someone who browses, leaves and comes back to
// register still registers in the language they first chose; short enough
// that a stale choice does not follow a shared machine forever.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function readLanguageCookie(name: string): string | null {
  return readCookie(name);
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // Lax rather than Strict: a customer following a link from an email
  // into the site should still see the language they picked.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** The language the site is currently rendered in. Changes freely. */
export function getDisplayLanguage(): Language {
  return asLanguage(readCookie(DISPLAY_LANGUAGE_COOKIE) ?? readCookie(FIRST_VISIT_LANGUAGE_COOKIE));
}

/**
 * Records a language choice.
 *
 * The display cookie is always updated. The first-visit cookie is written
 * ONLY if it has never been set -- that is the whole point of it. It is
 * the answer to "what language did this person choose when they arrived",
 * and someone switching the site to English to read one page has not
 * changed that answer. At registration it becomes
 * profiles.communication_language, which the switcher must never move.
 */
export function chooseLanguage(language: Language): void {
  writeCookie(DISPLAY_LANGUAGE_COOKIE, language);
  if (!readCookie(FIRST_VISIT_LANGUAGE_COOKIE)) {
    writeCookie(FIRST_VISIT_LANGUAGE_COOKIE, language);
  }
}

/**
 * Records the language a first-time visitor arrived in, when they have not
 * chosen one yet. Called on first paint so that someone who registers
 * without ever touching the switcher is still recorded against the
 * language they actually read the site in.
 */
export function rememberArrivalLanguage(language: Language): void {
  if (!readCookie(FIRST_VISIT_LANGUAGE_COOKIE)) {
    writeCookie(FIRST_VISIT_LANGUAGE_COOKIE, language);
  }
}
