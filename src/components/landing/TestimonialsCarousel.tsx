import Link from "next/link";

type Testimonial = { quote: string; name: string; rating: number };

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 text-accent-500">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={i < rating ? "" : "text-gray-300"}
        >
          <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
        </svg>
      ))}
    </div>
  );
}

function Card({
  t,
  fixedWidth = false,
  hidden = false,
}: {
  t: Testimonial;
  fixedWidth?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={`shrink-0 rounded-2xl bg-primary-50 p-6 ${fixedWidth ? "w-80" : "w-full"}`}
    >
      <Stars rating={t.rating} />
      <p className="mt-4 text-sm text-primary-900/80">{t.quote}</p>
      <div className="mt-6 flex items-center gap-3">
        <span className="h-8 w-8 rounded-full bg-accent-300" aria-hidden="true" />
        <span className="text-sm font-medium text-primary-900">{t.name}</span>
      </div>
    </div>
  );
}

export default function TestimonialsCarousel({ testimonials }: { testimonials: Testimonial[] }) {
  // Few enough that a continuous scroll would just loop the same handful
  // of cards awkwardly — lay them out statically instead.
  const scrolls = testimonials.length > 3;
  // Duration scales with how much content there is, so the scroll speed
  // (px/sec) stays roughly constant instead of 20 testimonials whipping by
  // as fast as 4 would.
  const durationSeconds = Math.max(20, testimonials.length * 6);

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
          <p className="text-5xl font-bold text-primary-900 sm:text-7xl">150k+</p>
        </div>

        {testimonials.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-primary-50 p-8 text-center">
            <p className="text-sm text-primary-900/70">
              No reviews yet — be the first to share your experience.
            </p>
          </div>
        ) : scrolls ? (
          <div
            data-testid="testimonials-carousel"
            className="mt-10 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
          >
            <div
              className="animate-marquee flex w-max gap-6 hover:[animation-play-state:paused]"
              style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
            >
              {testimonials.map((t, i) => (
                <Card key={`a-${i}`} t={t} fixedWidth />
              ))}
              {testimonials.map((t, i) => (
                <Card key={`b-${i}`} t={t} fixedWidth hidden />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <Card key={i} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
