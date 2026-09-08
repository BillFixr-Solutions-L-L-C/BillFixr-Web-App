export type RevenueMonth = { label: string; total: number };

const WIDTH = 410;
const HEIGHT = 170;

export default function RevenueChart({ months }: { months: RevenueMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.total));
  const stepX = months.length > 1 ? WIDTH / (months.length - 1) : 0;

  const points = months.map((m, i) => {
    const x = months.length > 1 ? i * stepX : WIDTH / 2;
    const y = HEIGHT - 5 - (m.total / max) * (HEIGHT - 10);
    return `${x},${y}`;
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  const areaPath = `${linePath} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B7CFA" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#5B7CFA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revenueFill)" />
        <path d={linePath} fill="none" stroke="#5B7CFA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        {months.map((m) => (
          <span key={m.label}>{m.label}</span>
        ))}
      </div>
    </div>
  );
}
