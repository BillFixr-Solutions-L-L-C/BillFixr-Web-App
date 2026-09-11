"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";

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
  const [restricted, setRestricted] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.subject.toLowerCase().includes(q) ||
      (t.profiles?.name ?? "").toLowerCase().includes(q) ||
      (t.profiles?.email ?? "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const level = await getDomainAccess(supabase, "client_data");
      if (!hasDomainAccess(level)) {
        setRestricted(true);
        setLoading(false);
        return;
      }
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
    await fetch(`/api/admin/support-tickets/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTickets((prev) => prev.map((t) => (t.id === active.id ? { ...t, status } : t)));
    setActive(null);
  }

  if (restricted) {
    return (
      <div>
        <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Support</h1>
        <AccessRestricted />
      </div>
    );
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
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Customer Tickets</h2>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by subject or customer"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="open">Pending</option>
            <option value="in_progress">Ongoing</option>
            <option value="resolved">Done</option>
          </select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No support tickets yet.</p>
        ) : filteredTickets.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No tickets match your search.</p>
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
                {filteredTickets.map((t, i) => (
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
