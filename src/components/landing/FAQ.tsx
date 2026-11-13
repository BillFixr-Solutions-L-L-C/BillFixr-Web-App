"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

// Message keys, not text. This constant is evaluated once at import, so
// translating here would freeze whichever language loaded first and the
// switcher would leave the FAQ behind -- the same trap as the sidebar nav
// and the how-it-works steps.
const faqs = [
  { questionKey: "faq.q1", answerKey: "faq.a1" },
  { questionKey: "faq.q2", answerKey: "faq.a2" },
  { questionKey: "faq.q3", answerKey: "faq.a3" },
  { questionKey: "faq.q4", answerKey: "faq.a4" },
] as const;

function ToggleIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="var(--color-primary-500)" strokeWidth="1.3" />
      <path d="M6 10h8" stroke="var(--color-primary-500)" strokeWidth="1.3" strokeLinecap="round" />
      {!open && <path d="M10 6v8" stroke="var(--color-primary-500)" strokeWidth="1.3" strokeLinecap="round" />}
    </svg>
  );
}

export default function FAQ() {
  const t = useT();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="relative overflow-hidden px-6 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary-100 to-transparent"
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-primary-900 sm:text-4xl">{t("faq.heading")}</h2>
        <p className="mt-3 text-sm text-primary-900/60">
          {t("faq.sub")}
        </p>

        <div className="mt-10 space-y-3 text-left">
          {faqs.map((faq, i) => {
            const open = openIndex === i;
            return (
              <div key={faq.questionKey} className="rounded-xl border border-primary-100">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-primary-900"
                  aria-expanded={open}
                >
                  {t(faq.questionKey)}
                  <ToggleIcon open={open} />
                </button>
                {open && (
                  <div className="space-y-3 px-5 pb-4 text-sm text-primary-900/60">
                    {t(faq.answerKey)
                      .split("\n\n")
                      .map((paragraph, j) => (
                        <p key={j}>{paragraph}</p>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
