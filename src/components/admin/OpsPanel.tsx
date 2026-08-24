"use client";

import { useState } from "react";

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

const alerts = [
  {
    tone: "success" as const,
    title: "Workflow events: Case8812 - isjbc Character completed",
    subtitle: "Workflow Case 8812 -  Sent 2hrs ago",
  },
  { tone: "danger" as const, title: "Failed task: Case 8725 - Retrying" },
  { tone: "success" as const, title: "Workflow events: Case8812 - isjbc Character completed" },
];

export default function OpsPanel() {
  const [failedTasks, setFailedTasks] = useState(2);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card title="Case Detail Overview">
        <Row label="Latest OCR" value="98% Accuracy" />
        <Row label="AI Analysis" value="2 High-Priority Risk" highlight />
        <Row label="Latest OCR" value="98% Accuracy" />
      </Card>

      <Card title="Automation Monitoring">
        <Row label="Workflow Status" value="Normal" />
        <Row label="Failed Tasks" value={String(failedTasks)} highlight={failedTasks > 0} />
        <button
          type="button"
          disabled={failedTasks === 0}
          onClick={() => setFailedTasks(0)}
          className="mt-2 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {failedTasks === 0 ? "All clear" : "Retry All"}
        </button>
      </Card>

      <Card title="User Management Snapshots">
        <Row label="Active Accounts" value="150" />
        <Row label="Pending Payments" value="5" />
      </Card>

      <Card title="Automation Alerts">
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  a.tone === "success" ? "bg-primary-500" : "bg-red-500"
                }`}
              />
              <div>
                <p className="font-medium text-gray-800">{a.title}</p>
                {a.subtitle && <p className="mt-0.5 text-xs text-gray-400">{a.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
