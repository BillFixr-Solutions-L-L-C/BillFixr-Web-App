"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import Footer from "@/components/landing/Footer";
import { createClient } from "@/lib/supabase/client";

function StarRating({ rating, onChange }: { rating: number; onChange: (value: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const value = i + 1;
        const filled = value <= (hover ?? rating);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(null)}
            aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
            className={filled ? "text-accent-500" : "text-gray-300"}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export default function TestimonialForm({ userId, name, email }: { userId: string; name: string; email: string }) {
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please share a few words about your experience.");
      return;
    }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("testimonials").insert({
      user_id: userId,
      name,
      rating,
      message: message.trim(),
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/">
          <Logo />
        </Link>
        <Link
          href="/dashboard/logout"
          className="rounded-full border border-primary-600 px-6 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
        >
          Log out
        </Link>
      </header>

      <main className="flex-1 px-6 py-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <WelcomeBanner subtitle="Feel free to tell us your experience" />

          {submitted ? (
            <div className="mt-16 rounded-2xl bg-primary-50 p-8 text-center">
              <p className="text-lg font-semibold text-gray-900">Thanks for sharing!</p>
              <p className="mt-2 text-sm text-gray-600">
                Your review has been submitted and is pending approval before it appears publicly.
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-block rounded-full bg-[#0f7545] px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
              >
                Back to dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mt-16 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900">Rate our services</h2>
                <StarRating rating={rating} onChange={setRating} />
              </div>

              <div className="mt-8">
                <label className="text-base text-gray-900">Email</label>
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="mt-2 w-full rounded-full border border-gray-200 px-5 py-3 text-sm text-gray-500 focus:outline-none"
                />
              </div>

              <div className="mt-6">
                <label className="text-base text-gray-900">Message</label>
                <textarea
                  rows={6}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your experience with BillFixr..."
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-5 py-4 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
                />
              </div>

              {error && <p className="mt-3 text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-8 rounded-full bg-[#0f7545] px-10 py-3.5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send Message"}
              </button>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
