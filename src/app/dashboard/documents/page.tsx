"use client";

import { useRouter } from "next/navigation";
import PageHeading from "@/components/dashboard/PageHeading";
import StatusPill from "@/components/dashboard/StatusPill";

const documents = [
  {
    bill: "Crown Med Hosp...",
    provider: "Crown health...",
    uploadDate: "Jul 14, 2026",
    status: "Sent",
    response: "Complete",
    responseTone: "success" as const,
    savings: "$2,345",
  },
  {
    bill: "Crown Med Hosp...",
    provider: "Crown health...",
    uploadDate: "Jul 14, 2026",
    status: "Sent",
    response: "In Process",
    responseTone: "warning" as const,
    savings: "$2,345",
  },
  {
    bill: "Crown Med Hosp...",
    provider: "Crown health...",
    uploadDate: "Jul 14, 2026",
    status: "Sent",
    response: "In Process",
    responseTone: "warning" as const,
    savings: "$2,345",
  },
  {
    bill: "Crown Med Hosp...",
    provider: "Crown health...",
    uploadDate: "Jul 14, 2026",
    status: "Sent",
    response: "In Process",
    responseTone: "warning" as const,
    savings: "$2,345",
  },
];

export default function MyDocumentsPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeading title="My Documents" />

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
            {documents.map((doc, i) => (
              <tr
                key={i}
                onClick={() => router.push("/dashboard/documents/1")}
                className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
              >
                <td className="flex items-center gap-2 px-4 py-3">
                  <span className="text-accent-500">📄</span>
                  {doc.bill}
                </td>
                <td className="px-4 py-3 text-gray-600">{doc.provider}</td>
                <td className="px-4 py-3 text-gray-600">{doc.uploadDate}</td>
                <td className="px-4 py-3">
                  <StatusPill tone="success">{doc.status}</StatusPill>
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={doc.responseTone}>{doc.response}</StatusPill>
                </td>
                <td className="px-4 py-3 text-gray-800">{doc.savings}</td>
                <td className="px-4 py-3 text-gray-400">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
