"use client";

import { useRouter } from "next/navigation";
import StatusPill from "@/components/dashboard/StatusPill";

type Bill = {
  id: string;
  filename: string;
  provider_name: string | null;
  status: string;
  uploaded_at: string;
};

const statusTone: Record<string, "success" | "warning" | "danger" | "muted"> = {
  uploaded: "muted",
  scanning: "warning",
  analyzed: "success",
  error: "danger",
};

const statusLabel: Record<string, string> = {
  uploaded: "Uploaded",
  scanning: "Scanning",
  analyzed: "Analyzed",
  error: "Error",
};

export default function DocumentsTable({ bills }: { bills: Bill[] }) {
  const router = useRouter();

  if (bills.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        You haven&apos;t uploaded any bills yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
            <th className="px-4 py-3">Bill</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Upload Date</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Provider Response</th>
            <th className="px-4 py-3">Savings</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => (
            <tr
              key={bill.id}
              onClick={() => router.push(`/dashboard/documents/${bill.id}`)}
              className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
            >
              <td className="flex items-center gap-2 px-4 py-3">
                <span className="text-accent-500">📄</span>
                {bill.filename}
              </td>
              <td className="px-4 py-3 text-gray-600">{bill.provider_name ?? "—"}</td>
              <td className="px-4 py-3 text-gray-600">
                {new Date(bill.uploaded_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3">
                <StatusPill tone={statusTone[bill.status] ?? "muted"}>
                  {statusLabel[bill.status] ?? bill.status}
                </StatusPill>
              </td>
              <td className="px-4 py-3">
                <StatusPill tone="muted">Pending</StatusPill>
              </td>
              <td className="px-4 py-3 text-gray-400">—</td>
              <td className="px-4 py-3 text-gray-400">⋮</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
