const labels = [
  { key: "billsAnalyzed", label: "BILL ANALYZED" },
  { key: "savingsFound", label: "SAVINGS FOUND" },
  { key: "errorsDetected", label: "ERRORS DETECTED" },
  { key: "appealsGenerated", label: "APPEAL GENERATED" },
] as const;

export default function DashboardStats({
  values,
}: {
  values: { billsAnalyzed: string; savingsFound: string; errorsDetected: string; appealsGenerated: string };
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {labels.map((l) => (
        <div key={l.key} className="rounded-xl bg-white px-4 py-4 text-center shadow-sm">
          <p className="text-xs font-medium tracking-wide text-gray-400">{l.label}</p>
          <p className="mt-1.5 text-xl font-bold text-gray-900">{values[l.key]}</p>
        </div>
      ))}
    </div>
  );
}
