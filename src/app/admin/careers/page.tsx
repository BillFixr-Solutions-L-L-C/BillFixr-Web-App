"use client";

import { useState } from "react";
import ResumePreview from "@/components/admin/ResumePreview";

const applicants = [
  { id: "#000189", customer: "Charlene Reed", email: "charlenereed@gmail.com", role: "DevOps Engineer", date: "08/07/2025", status: "New" },
  { id: "#000186", customer: "Emeka James", email: "emekajames@gmail.com", role: "DevOps Engineer", date: "09/07/2025", status: "Reviewed" },
  { id: "#000184", customer: "Victory Jude", email: "victoryjude@gmail.com", role: "DevOps Engineer", date: "09/07/2025", status: "New" },
  { id: "#000181", customer: "Sam Kenny", email: "samkenny@gmail.com", role: "DevOps Engineer", date: "09/07/2025", status: "Reviewed" },
];

const statusTone: Record<string, string> = {
  New: "text-accent-600",
  Reviewed: "text-primary-600",
};

export default function AdminCareersPage() {
  const [active, setActive] = useState<(typeof applicants)[number] | null>(null);
  const [cvOpen, setCvOpen] = useState(false);

  if (active) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold text-gray-900">Careers</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Applicants Upload</p>

        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex gap-8 text-sm">
            <p>
              Ticket ID: <span className="font-medium text-gray-900">{active.id}</span>
            </p>
            <p>
              Role: <span className="font-medium text-gray-900">{active.role}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

          <div className="mt-6 rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-accent-500">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {active.customer.replace(" ", "_")}_CV.pdf
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-400">
                    205kb
                    <span className="text-primary-600">✓ Uploaded</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCvOpen(true)}
                className="text-sm font-medium text-primary-600"
              >
                👁 View
              </button>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Back to Applicants
            </button>
          </div>
        </div>

        {cvOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 shadow-xl">
              <button
                type="button"
                onClick={() => setCvOpen(false)}
                aria-label="Close"
                className="absolute right-6 top-6 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
              <ResumePreview />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Careers</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Applicants Upload</h2>
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
                <th className="py-3 pr-4">Applicant</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((a, i) => (
                <tr
                  key={i}
                  onClick={() => setActive(a)}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                >
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="py-3 pr-4 text-gray-800">{a.id}</td>
                  <td className="py-3 pr-4 text-gray-800">{a.customer}</td>
                  <td className="py-3 pr-4 text-gray-500">{a.role}</td>
                  <td className="py-3 pr-4 text-gray-500">{a.date}</td>
                  <td className={`py-3 font-medium ${statusTone[a.status]}`}>{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
