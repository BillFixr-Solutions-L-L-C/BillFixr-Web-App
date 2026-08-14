"use client";

import { useState } from "react";
import Link from "next/link";

const testimonials = [
  {
    quote:
      "BillFixr is real, i am glad i came across this website. Thank you. BillFixr is real, i am glad i came across this website. Thank you",
    name: "Kelvin Claire",
  },
  {
    quote:
      "I was over billed with $20,000 and it was fix to $9,000.. I'm really happy to be honest I was over billed with $20,000 and it was fix to $9,000.. I'm really happy to be honest",
    name: "Josephine Marley",
  },
  {
    quote:
      "BillFixr is real, i am glad i came across this website. Thank you. BillFixr is real, i am glad i came across this website. Thank you",
    name: "Stone Clara",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 text-accent-500">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials() {
  const [start, setStart] = useState(0);
  const visible = [0, 1, 2].map((i) => testimonials[(start + i) % testimonials.length]);

  return (
    <section id="testimonials" className="relative overflow-hidden px-6 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary-100 to-transparent"
      />

      <div className="relative mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold text-primary-900">Why Users Trust BillFixr</h2>
            <p className="mt-2 max-w-xs text-sm text-primary-900/60">
              Over 150,000 Use BillFixr To Reduce Their Medical Bills
            </p>
            <Link
              href="/testimonial"
              className="mt-3 inline-block text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              Share your experience →
            </Link>
          </div>
          <p className="text-4xl font-bold text-primary-900 sm:text-5xl">150k+</p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {visible.map((t, i) => (
            <div key={i} className="rounded-2xl bg-primary-50 p-6">
              <Stars />
              <p className="mt-4 text-sm text-primary-900/80">{t.quote}</p>
              <div className="mt-6 flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-accent-300" aria-hidden="true" />
                <span className="text-sm font-medium text-primary-900">{t.name}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              setStart((s) => (s - 1 + testimonials.length) % testimonials.length)
            }
            aria-label="Previous testimonials"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-300 text-primary-700 transition hover:bg-primary-50"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setStart((s) => (s + 1) % testimonials.length)}
            aria-label="Next testimonials"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-300 text-primary-700 transition hover:bg-primary-50"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}
