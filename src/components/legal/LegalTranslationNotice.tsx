"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { chooseLanguage } from "@/lib/languageCookie";
import { useTranslation } from "@/lib/i18n/client";

// Says, on a translated legal page, which version governs.
//
// The four legal pages state what BillFixr commits to: what we may do with
// a customer's medical bill, what we will refund, what law applies. The
// Spanish on them is a careful translation, not a lawyer's, and a
// mistranslated clause in a document like that is a different kind of
// problem from a mistranslated button -- so the page says plainly that the
// English is the governing text, which is the ordinary practice for a
// translated agreement.
//
// Renders nothing on the English pages: there is nothing to disclaim when
// the reader is already on the governing version.
//
// The button is here rather than only in the navbar because this is where
// a reader who has just been told the English governs will look for it. It
// uses the same chooseLanguage() + router.refresh() pair as
// LanguageSwitcher, so the display cookie moves and the server components
// re-render -- and, as there, it does NOT touch
// profiles.communication_language, so reading this page in English does
// not switch the language we write to them in.
export default function LegalTranslationNotice() {
  const router = useRouter();
  const { language, t } = useTranslation();
  const [pending, startTransition] = useTransition();

  if (language === "en") return null;

  function readInEnglish() {
    chooseLanguage("en");
    startTransition(() => router.refresh());
  }

  return (
    <aside className="mt-6 rounded-xl border border-primary-100 bg-white px-5 py-4 text-sm text-primary-900/80">
      <p>{t("legal.courtesyNotice")}</p>
      <button
        type="button"
        onClick={readInEnglish}
        disabled={pending}
        className="mt-2 font-semibold text-primary-600 underline hover:text-primary-700 disabled:opacity-60"
      >
        {t("legal.readInEnglish")}
      </button>
    </aside>
  );
}
