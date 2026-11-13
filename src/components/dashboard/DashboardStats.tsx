"use client";

import { useT } from "@/lib/i18n/client";

// Message keys, not labels: a module-level constant is evaluated once at
// import, so translating here would freeze whichever language loaded
// first and the switcher would leave these cards behind.
const labels = [
  { key: "billsAnalyzed", labelKey: "stats.billAnalyzed" },
  { key: "savingsFound", labelKey: "stats.savingsFound" },
  { key: "errorsDetected", labelKey: "stats.errorsDetected" },
  { key: "appealsGenerated", labelKey: "stats.appealGenerated" },
] as const;

export default function DashboardStats({
  values,
}: {
  values: { billsAnalyzed: string; savingsFound: string; errorsDetected: string; appealsGenerated: string };
}) {
  const t = useT();
  return (
    <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
      {labels.map((l) => (
        <div key={l.key} className="rounded-xl bg-white px-5 py-6 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-400">{t(l.labelKey)}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{values[l.key]}</p>
        </div>
      ))}
    </div>
  );
}
