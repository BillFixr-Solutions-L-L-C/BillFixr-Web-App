export type DonutSegment = { label: string; value: number; color: string };

export default function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  const arcs = segments.reduce<Array<(typeof segments)[number] & { length: number; offset: number }>>(
    (acc, s) => {
      const length = (s.value / 100) * circumference;
      const prev = acc[acc.length - 1];
      const offset = prev ? prev.offset + prev.length : 0;
      acc.push({ ...s, length, offset });
      return acc;
    },
    [],
  );

  return (
    // Sized against the card's own width, not the viewport — this chart
    // sits in a half- or third-width dashboard column, so a viewport
    // breakpoint (sm:) switched to a side-by-side layout even when the
    // actual card was too narrow for it, overlapping the legend text.
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @lg:flex-row @lg:gap-8">
        <svg viewBox="0 0 160 160" className="h-32 w-32 shrink-0 -rotate-90 @lg:h-40 @lg:w-40">
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="26"
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </svg>

        <ul className="flex flex-col gap-2 text-sm text-gray-500">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.value}% {s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
