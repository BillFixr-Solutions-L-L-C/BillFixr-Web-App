import { cookies } from "next/headers";

import {
  DEFAULT_LANGUAGE,
  DISPLAY_LANGUAGE_COOKIE,
  FIRST_VISIT_LANGUAGE_COOKIE,
  asLanguage,
  type Language,
} from "@/lib/language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/**
 * The language to render this request in.
 *
 * The display cookie, falling back to the first-visit one. This is the
 * DISPLAY language and nothing else: it must never be used to decide what
 * language to write to a customer in. That is
 * profiles.communication_language, read with customerLanguage() — see
 * src/lib/language.ts for why the two are kept apart.
 */
export async function getDisplayLanguage(): Promise<Language> {
  try {
    const jar = await cookies();
    return asLanguage(
      jar.get(DISPLAY_LANGUAGE_COOKIE)?.value ?? jar.get(FIRST_VISIT_LANGUAGE_COOKIE)?.value,
    );
  } catch {
    // `cookies()` throws when there is no request scope -- a component
    // rendered directly in a test, or anything statically evaluated at
    // build time. A language preference is not worth failing a page over,
    // so that degrades to English rather than crashing. Found when
    // translating the pricing page broke its own tests, which render the
    // server component directly.
    return DEFAULT_LANGUAGE;
  }
}

/** A translator bound to this request's display language, for server components. */
export async function getT(): Promise<(key: MessageKey, values?: Record<string, string | number>) => string> {
  const language = await getDisplayLanguage();
  return (key, values) => translate(language, key, values);
}
