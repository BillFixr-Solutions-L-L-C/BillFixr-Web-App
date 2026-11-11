"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SUPPORTED_LANGUAGES, type Language } from "@/lib/language";
import { chooseLanguage } from "@/lib/languageCookie";
import { useTranslation } from "@/lib/i18n/client";

// Switches what the site is rendered in.
//
// What it does NOT do is change what BillFixr writes to the customer in.
// chooseLanguage() updates the display cookie every time and the
// first-visit cookie only if it has never been set, and the profile's
// communication_language is written once at registration and never read
// from here. A customer who flips this to English to read a page keeps
// getting their case correspondence in Spanish, which is the requirement.
//
// router.refresh() rather than location.reload(): server components read
// the cookie through getDisplayLanguage(), so they have to re-render, but
// a full reload would throw away client state -- a half-filled
// information step among it.
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { language, t } = useTranslation();
  const [pending, startTransition] = useTransition();

  function pick(next: Language) {
    if (next === language) return;
    chooseLanguage(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className={`flex items-center gap-1 ${className}`} role="group" aria-label={t("lang.label")}>
      {SUPPORTED_LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          disabled={pending}
          aria-current={code === language ? "true" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
            code === language
              ? "bg-[#0f7545] text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t(code === "en" ? "lang.en" : "lang.es")}
        </button>
      ))}
    </div>
  );
}
