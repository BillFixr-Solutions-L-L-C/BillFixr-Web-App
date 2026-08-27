import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type CaseWithProfile = {
  id: string;
  status: string;
  created_at: string;
  profiles: { name: string } | null;
};

const DELIVERED_STATUSES = new Set(["resolved", "paid", "closed", "closed_no_errors"]);

export default async function CaseTable() {
  const supabase = await createClient();
  const { data: cases } = await supabase
    .from("cases")
    .select("id, status, created_at, profiles(name)")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (cases ?? []) as unknown as CaseWithProfile[];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-3 pr-4">SN</th>
            <th className="py-3 pr-4">Case ID</th>
            <th className="py-3 pr-4">Client Name</th>
            <th className="py-3 pr-4">Date of Order</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-gray-400">
                No cases yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const delivered = DELIVERED_STATUSES.has(row.status);
              return (
                <tr key={row.id} className="border-t border-gray-50">
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="py-3 pr-4 text-gray-800">
                    <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                      #{row.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-gray-800">{row.profiles?.name ?? "Unknown"}</td>
                  <td className="py-3 pr-4 text-gray-500">
                    {new Date(row.created_at).toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={`py-3 pr-4 font-medium ${delivered ? "text-primary-600" : "text-accent-600"}`}>
                    {delivered ? "Delivered" : "In Progress"}
                  </td>
                  <td className="py-3 text-gray-500">
                    <Link href={`/admin/cases/${row.id}`} className="hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
