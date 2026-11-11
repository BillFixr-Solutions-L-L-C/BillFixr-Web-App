"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_LANGUAGE, type Language } from "@/lib/language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

// The display language for client components.
//
// Seeded from the server so the first paint is already in the right
// language -- reading the cookie in an effect would render English and
// then flip, which is visible and looks broken.

const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

/** The language the site is currently rendered in. */
export function useLanguage(): Language {
  return useContext(LanguageContext);
}

/**
 * A translator for the current display language.
 *
 * Deliberately not called `t` at the import site: a component that wants
 * to know what language to EMAIL someone in must not reach for this. This
 * is what the screen is in, which is a different question.
 */
export function useT(): (key: MessageKey, values?: Record<string, string | number>) => string {
  const language = useLanguage();
  return useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(language, key, values),
    [language],
  );
}

/** The same thing as an object, for components that destructure. */
export function useTranslation(): {
  language: Language;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
} {
  const language = useLanguage();
  const t = useT();
  return useMemo(() => ({ language, t }), [language, t]);
}
