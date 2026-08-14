const months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan"];

const path =
  "M0,150 C20,120 35,95 55,105 C75,115 85,135 105,130 C130,124 140,60 165,45 " +
  "C185,33 195,55 215,75 C235,95 245,140 265,150 C285,158 300,115 320,95 " +
  "C340,80 355,70 375,55 C390,45 400,35 410,20";

export default function RevenueChart() {
  return (
    <div>
      <svg viewBox="0 0 410 170" className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B7CFA" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#5B7CFA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L410,170 L0,170 Z`} fill="url(#revenueFill)" />
        <path d={path} fill="none" stroke="#5B7CFA" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        {months.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}
