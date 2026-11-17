"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

// A table that is wider than the screen, with some way of knowing that.
//
// Every table in this app was already wrapped in `overflow-x-auto` with a
// `min-w-*`, so on a phone the later columns were reachable -- but nothing
// said so. A touch device draws no scrollbar, and the columns were cut
// dead at the card edge, so the Active Case screen showed a customer their
// bill and provider and simply hid the status, the appeal letter and the
// proposed savings. Reachable and discoverable are not the same thing, and
// the audit that only measured overflow called this fine.
//
// This keeps the desktop rendering byte-identical -- when nothing
// overflows, nothing is drawn -- and on a narrow screen adds:
//   - a fade on whichever edge has more content behind it
//   - a one-line hint, until the reader scrolls
//
// The fades are `pointer-events-none`, or they would eat the touch that
// scrolls the thing they are advertising.
export default function TableScroller({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  /** Classes for the scrolling element -- usually the card's own rounding/background. */
  className?: string;
  /** Accessible name, so a screen reader announces what this region scrolls. */
  label?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // A pixel of slack: sub-pixel layout rounding otherwise reports a
    // table that fits exactly as permanently scrollable.
    setOverflowing(max > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    measure();
    // Rotating the phone, or the table's own content loading, both change
    // the answer. ResizeObserver does not exist in jsdom, so this is
    // guarded rather than assumed.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div>
      {/* The fades are positioned against this, not against the whole
          component, so they cover the table and stop at its bottom edge
          rather than running down over the hint underneath it. */}
      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          role={overflowing ? "region" : undefined}
          aria-label={overflowing ? (label ?? t("table.swipe")) : undefined}
          tabIndex={overflowing ? 0 : undefined}
          className={`overflow-x-auto ${className}`}
        >
          {children}
        </div>

        {overflowing && !atStart && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/[0.07] to-transparent"
          />
        )}
        {overflowing && !atEnd && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/[0.07] to-transparent"
          />
        )}
      </div>

      {overflowing && atStart && (
        <p className="mt-2 pr-1 text-right text-xs text-gray-500 sm:hidden">{t("table.swipe")} →</p>
      )}
    </div>
  );
}
