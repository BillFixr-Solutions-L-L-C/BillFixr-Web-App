"use client";

import { useState } from "react";

const faqs = [
  {
    question: "Who is eligible?",
    answer:
      "BillFixr is available to individuals 18 years or older residing in the United States. By using the service, you confirm that the medical bill you upload belongs to you or you have legal authorization to act on behalf of the patient.",
  },
  {
    question: "What's the Fees & Payment Terms",
    answer:
      "A small commitment fee is charged when your bill is submitted for analysis. If errors are found and your bill is successfully reduced, a success fee is charged as a percentage of your savings. If no errors are found, no success fee applies.",
  },
  {
    question: "Service Description",
    answer:
      "BillFixr uses AI to scan your medical bill for billing errors, then generates and sends negotiation documents to your provider on your behalf, following up until a resolution is reached.",
  },
  {
    question: "Why is there a five-dollar commitment fee?",
    answer:
      "The five-dollar commitment fee is simply a gentle way to make sure we are supporting people who truly need help. Many people upload bills without any intention of continuing, and that slows down the process for those who are genuinely overwhelmed and looking for real relief.\n\nThis small fee helps us focus our time and energy on you. It also goes directly toward your final BillFixr fee, so you are not paying anything extra.\n\nIt is just a simple step that allows us to begin working on your bill immediately and give you the attention you deserve.",
  },
];

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
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="relative overflow-hidden px-6 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary-100 to-transparent"
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-primary-900 sm:text-4xl">
          Frequently Asked Questions
        </h2>
        <p className="mt-3 text-sm text-primary-900/60">
          Everything you need to know about the product and bill.
        </p>

        <div className="mt-10 space-y-3 text-left">
          {faqs.map((faq, i) => {
            const open = openIndex === i;
            return (
              <div key={faq.question} className="rounded-xl border border-primary-100">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-primary-900"
                  aria-expanded={open}
                >
                  {faq.question}
                  <ToggleIcon open={open} />
                </button>
                {open && (
                  <div className="space-y-3 px-5 pb-4 text-sm text-primary-900/60">
                    {faq.answer.split("\n\n").map((paragraph, j) => (
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
