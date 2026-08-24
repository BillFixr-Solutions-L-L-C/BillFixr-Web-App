const segments = [
  { label: "Pending", value: 10, color: "#5B7CFA" },
  { label: "Failed", value: 3, color: "#F45B94" },
  { label: "Success", value: 80, color: "#2DD9B0" },
  { label: "Reviews", value: 7, color: "#F5A93F" },
];

export default function DonutChart() {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <svg viewBox="0 0 160 160" className="h-32 w-32 shrink-0 -rotate-90 sm:h-40 sm:w-40">
        {segments.map((s) => {
          const length = (s.value / 100) * circumference;
          const circle = (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="26"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-500">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.value}{s.label === "Reviews" ? "" : "%"} {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
