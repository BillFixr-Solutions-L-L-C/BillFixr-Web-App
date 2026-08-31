"use client";

import { useState } from "react";

type Testimonial = {
  id: string;
  name: string;
  email: string;
  message: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const statusTone: Record<Testimonial["status"], string> = {
  pending: "text-accent-600",
  approved: "text-primary-600",
  rejected: "text-danger",
};

const statusLabel: Record<Testimonial["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function AdminTestimonialsClient({ initialTestimonials }: { initialTestimonials: Testimonial[] }) {
  const [testimonials, setTestimonials] = useState(initialTestimonials);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = testimonials.find((t) => t.id === activeId) ?? null;

  async function setStatus(id: string, status: "approved" | "rejected") {
    setSaving(true);
    const res = await fetch(`/api/admin/testimonials/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSaving(false);
    if (!res.ok) return;
    setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setActiveId(null);
  }

  if (active) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold text-gray-900">Testimonials</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Testimonial Tickets</p>

        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex items-start gap-6">
            <span className="h-16 w-16 shrink-0 rounded-full bg-primary-100" />
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex gap-8 text-sm">
                <p>
                  Rating: <span className="font-medium text-gray-900">{active.rating} / 5</span>
                </p>
                <p>
                  Status:{" "}
                  <span className={`font-medium ${statusTone[active.status]}`}>{statusLabel[active.status]}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Customer Name</p>
                <input readOnly defaultValue={active.name} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <input readOnly defaultValue={active.email} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-gray-600">Message</p>
            <textarea
              readOnly
              rows={8}
              defaultValue={active.message}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving || active.status === "rejected"}
              onClick={() => setStatus(active.id, "rejected")}
              className="flex items-center gap-2 rounded-full bg-danger px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Reject ✕
            </button>
            <button
              type="button"
              disabled={saving || active.status === "approved"}
              onClick={() => setStatus(active.id, "approved")}
              className="flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Approve ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Testimonials</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Testimonial Tickets</h2>

        {testimonials.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No testimonials submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Rating</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {testimonials.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                    <td className="py-3 pr-4 text-gray-800">{t.name}</td>
                    <td className="py-3 pr-4 text-gray-500">{t.email}</td>
                    <td className="py-3 pr-4 text-gray-500">{t.rating} / 5</td>
                    <td className={`py-3 font-medium ${statusTone[t.status]}`}>{statusLabel[t.status]}</td>
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
