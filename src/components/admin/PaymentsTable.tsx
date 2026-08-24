"use client";

import { useState } from "react";

type Row = {
  id: string;
  customer: string;
  amount: string;
  date: string;
  time: string;
  status: string;
};

export default function PaymentsTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Row | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-3 pr-4">SN</th>
            <th className="py-3 pr-4">Order ID</th>
            <th className="py-3 pr-4">Customer</th>
            <th className="py-3 pr-4">Amount</th>
            <th className="py-3 pr-4">Date</th>
            <th className="py-3 pr-4">Time</th>
            <th className="py-3 pr-4">Channel</th>
            <th className="py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => setSelected(row)}
              className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
            >
              <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
              <td className="py-3 pr-4 text-gray-800">{row.id}</td>
              <td className="py-3 pr-4 text-gray-800">{row.customer}</td>
              <td className="py-3 pr-4 text-gray-800">{row.amount}</td>
              <td className="py-3 pr-4 text-gray-500">{row.date}</td>
              <td className="py-3 pr-4 text-gray-500">{row.time}</td>
              <td className="py-3 pr-4 text-gray-500">Card</td>
              <td
                className={`py-3 font-medium ${
                  row.status === "Successful" ? "text-primary-600" : "text-accent-600"
                }`}
              >
                {row.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Billing Details</h2>
            <p className="mt-1 text-sm text-gray-500">Order {selected.id}</p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-gray-900">Billing Model</p>
                <p className="mt-1 text-sm text-gray-500">One-time, per-case fee</p>
                <p className="text-sm text-gray-500">No recurring subscription</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Customer</p>
                <p className="mt-1 text-sm text-gray-500">{selected.customer}</p>
                <p className="text-sm text-gray-500">Paid via Card</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Payment Date</p>
                <p className="mt-1 text-sm text-gray-500">
                  {selected.date}, {selected.time}
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Amount Paid</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    selected.status === "Successful" ? "text-primary-600" : "text-accent-600"
                  }`}
                >
                  {selected.amount} · {selected.status}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
