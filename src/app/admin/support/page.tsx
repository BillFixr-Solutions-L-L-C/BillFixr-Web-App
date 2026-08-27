"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  profiles: { name: string; email: string } | null;
};

const statusTone: Record<string, string> = {
  open: "text-accent-600",
  resolved: "text-primary-600",
  in_progress: "text-blue-500",
};

const statusLabel: Record<string, string> = {
  open: "Pending",
  in_progress: "Ongoing",
  resolved: "Done",
};

export default function AdminSupportPage() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("support_tickets")
        .select("id, subject, message, status, created_at, profiles(name, email)")
        .order("created_at", { ascending: false });
      setTickets((data as unknown as Ticket[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function updateStatus(status: string) {
    if (!active) return;
    const supabase = createClient();
    await supabase.from("support_tickets").update({ status }).eq("id", active.id);
    setTickets((prev) => prev.map((t) => (t.id === active.id ? { ...t, status } : t)));
    setActive(null);
  }

  if (active) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold text-gray-900">Support</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Customer Tickets</p>

        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex items-start gap-6">
            <span className="h-16 w-16 shrink-0 rounded-full bg-primary-100" />
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3 flex gap-8 text-sm">
                <p>
                  Subject: <span className="font-medium text-gray-900">{active.subject}</span>
                </p>
                <p>
                  Status:{" "}
                  <span className={`font-medium ${statusTone[active.status]}`}>
                    {statusLabel[active.status] ?? active.status}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Customer Name</p>
                <input
                  readOnly
                  defaultValue={active.profiles?.name ?? "Unknown"}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <input readOnly defaultValue="—" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <input
                  readOnly
                  defaultValue={active.profiles?.email ?? "—"}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-gray-600">Description</p>
            <textarea
              readOnly
              rows={4}
              defaultValue={active.message}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => updateStatus("in_progress")}
              className="flex items-center gap-2 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
            >
              Mark in-progress ⏱
            </button>
            <button
              type="button"
              onClick={() => updateStatus("resolved")}
              className="flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Mark as Resolved ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Support</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Customer Tickets</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>Day</option>
          </select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No support tickets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Subject</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Mails</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => setActive(t)}
                    className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                    <td className="py-3 pr-4 text-gray-800">{t.subject}</td>
                    <td className="py-3 pr-4 text-gray-800">{t.profiles?.name ?? "Unknown"}</td>
                    <td className="py-3 pr-4 text-gray-500">{t.profiles?.email ?? "—"}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(t.created_at).toLocaleDateString("en-US", {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className={`py-3 font-medium ${statusTone[t.status]}`}>{statusLabel[t.status] ?? t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
