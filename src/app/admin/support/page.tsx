"use client";

import { useState } from "react";

const tickets = [
  { id: "#000189", customer: "Emeka James", email: "deaces@gmail.com", date: "08/07/2025", status: "Pending" },
  { id: "#000183", customer: "Victory Jude", email: "searws@gmail.com", date: "09/07/2025", status: "Done" },
  { id: "#000182", customer: "Sam Kenny", email: "searws@gmail.com", date: "09/07/2025", status: "Ongoing" },
  { id: "#000184", customer: "Joe Klean", email: "searws@gmail.com", date: "09/07/2025", status: "Done" },
  { id: "#000180", customer: "Yemi Alade", email: "searws@gmail.com", date: "09/07/2025", status: "Pending" },
  { id: "#000185", customer: "Blessing Oji", email: "searws@gmail.com", date: "09/07/2025", status: "Done" },
];

const statusTone: Record<string, string> = {
  Pending: "text-accent-600",
  Done: "text-primary-600",
  Ongoing: "text-blue-500",
};

export default function AdminSupportPage() {
  const [active, setActive] = useState<(typeof tickets)[number] | null>(null);

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
                  Ticket ID: <span className="font-medium text-gray-900">{active.id}</span>
                </p>
                <p>
                  Status:{" "}
                  <span className={`font-medium ${statusTone[active.status]}`}>{active.status}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Customer Name</p>
                <input readOnly defaultValue={active.customer} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <input readOnly defaultValue="+234 816907650" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <input readOnly defaultValue={active.email} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-gray-600">Description</p>
            <textarea
              readOnly
              rows={4}
              defaultValue="Customer is asking whether payment is required before they get access to their adjusted bill and negotiation documents."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="flex items-center gap-2 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
            >
              Mark in-progress ⏱
            </button>
            <button
              type="button"
              onClick={() => setActive(null)}
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">SN</th>
                <th className="py-3 pr-4">Ticket ID</th>
                <th className="py-3 pr-4">Customer</th>
                <th className="py-3 pr-4">Mails</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => (
                <tr
                  key={i}
                  onClick={() => setActive(t)}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                >
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="py-3 pr-4 text-gray-800">{t.id}</td>
                  <td className="py-3 pr-4 text-gray-800">{t.customer}</td>
                  <td className="py-3 pr-4 text-gray-500">{t.email}</td>
                  <td className="py-3 pr-4 text-gray-500">{t.date}</td>
                  <td className={`py-3 font-medium ${statusTone[t.status]}`}>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
