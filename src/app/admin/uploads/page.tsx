"use client";

import { useState } from "react";
import BillPreview from "@/components/dashboard/BillPreview";

const uploads = [
  { id: "#000189", customer: "Emeka James", description: "Healthcare medical bill", date: "21 February", time: "9:30PM" },
  { id: "#000187", customer: "Victory Jude", description: "Sunshine medical bill", date: "21 February", time: "10:00PM" },
  { id: "#000187", customer: "Victory Jude", description: "Healthcare medical bill", date: "21 February", time: "10:00PM" },
  { id: "#000187", customer: "Victory Jude", description: "Healthcare medical bill", date: "21 February", time: "10:00PM" },
  { id: "#000187", customer: "Victory Jude", description: "Sunshine medical bill", date: "21 February", time: "10:00PM" },
  { id: "#000187", customer: "Victory Jude", description: "Sunshine medical bill", date: "21 February", time: "10:00PM" },
];

export default function AdminUploadsPage() {
  const [selected, setSelected] = useState<(typeof uploads)[number] | null>(null);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Uploads</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Customer Upload</h2>
          <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500">
            <option>Day</option>
            <option>Week</option>
            <option>Month</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">SN</th>
                <th className="py-3 pr-4">Upload ID</th>
                <th className="py-3 pr-4">Customer</th>
                <th className="py-3 pr-4">Description</th>
                <th className="py-3 pr-4">Date of Upload</th>
                <th className="py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u, i) => (
                <tr
                  key={i}
                  onClick={() => setSelected(u)}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                >
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="py-3 pr-4 text-gray-800">{u.id}</td>
                  <td className="py-3 pr-4 text-gray-800">{u.customer}</td>
                  <td className="py-3 pr-4 text-gray-500">{u.description}</td>
                  <td className="py-3 pr-4 text-gray-500">{u.date}</td>
                  <td className="py-3 text-gray-500">{u.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <p>Showing 1-20 of 75 entries</p>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-gray-200 px-4 py-1.5">
              ← Previous
            </button>
            <button type="button" className="rounded-lg border border-gray-200 px-4 py-1.5">
              Next →
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-6 top-6 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="font-serif text-2xl font-bold text-gray-900">Customer Upload</h2>

            <div className="mt-6 grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-gray-400">Upload ID</p>
                <p className="mt-1 font-medium text-gray-800">{selected.id.replace("#", "0")}</p>
              </div>
              <div>
                <p className="text-gray-400">Customer</p>
                <p className="mt-1 font-medium text-gray-800">{selected.customer}</p>
              </div>
              <div>
                <p className="text-gray-400">Phone</p>
                <p className="mt-1 font-medium text-gray-800">+234814579088</p>
              </div>
              <div>
                <p className="text-gray-400">Date</p>
                <p className="mt-1 font-medium text-gray-800">{selected.date}, 2026</p>
              </div>
              <div>
                <p className="text-gray-400">Time</p>
                <p className="mt-1 font-medium text-gray-800">{selected.time}</p>
              </div>
              <div>
                <p className="text-gray-400">No of Uploads</p>
                <p className="mt-1 font-medium text-gray-800">6</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-gray-400">Description</p>
              <p className="mt-1 text-sm font-medium text-gray-800">{selected.description}</p>
            </div>

            <div className="mt-4 max-h-64 max-w-[220px] overflow-hidden rounded-xl">
              <BillPreview />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
