function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
        highlight ? "bg-red-50" : ""
      }`}
    >
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? "font-medium text-red-500" : "font-medium text-gray-800"}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function OpsPanel({
  activeAccounts,
  pendingPayments,
}: {
  activeAccounts: number;
  pendingPayments: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card title="Case Detail Overview">
        <Row label="Latest OCR" value="98% Accuracy" />
        <Row label="AI Analysis" value="2 High-Priority Risk" highlight />
      </Card>

      <Card title="User Management Snapshots">
        <Row label="Active Accounts" value={activeAccounts.toLocaleString()} />
        <Row label="Pending Payments" value={pendingPayments.toLocaleString()} highlight={pendingPayments > 0} />
      </Card>

      <Card title="Automation Alerts">
        <p className="text-sm text-gray-400">No automation pipeline connected yet.</p>
      </Card>
    </div>
  );
}
