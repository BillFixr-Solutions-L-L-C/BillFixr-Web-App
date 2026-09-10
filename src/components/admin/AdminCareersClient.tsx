"use client";

import { useState } from "react";
import JobPostingsPanel from "@/components/admin/JobPostingsPanel";

type Posting = {
  id: string;
  title: string;
  location: string;
  listingDescription: string;
  responsibilities: string[];
  requirements: string[];
  benefit: string | null;
  status: "open" | "closed";
};

type Applicant = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  status: "received" | "reviewed";
  cvFilename: string;
  cvPreviewUrl: string | null;
  cvDownloadUrl: string | null;
};

const statusTone: Record<Applicant["status"], string> = {
  received: "text-accent-600",
  reviewed: "text-primary-600",
};

const statusLabel: Record<Applicant["status"], string> = {
  received: "New",
  reviewed: "Reviewed",
};

export default function AdminCareersClient({
  initialPostings,
  initialApplicants,
}: {
  initialPostings: Posting[];
  initialApplicants: Applicant[];
}) {
  const [tab, setTab] = useState<"applicants" | "postings">("applicants");
  const [applicants, setApplicants] = useState(initialApplicants);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Applicant["status"]>("all");

  const active = applicants.find((a) => a.id === activeId) ?? null;

  const filteredApplicants = applicants.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.role.toLowerCase().includes(q);
  });

  async function markReviewed() {
    if (!active) return;
    setSaving(true);
    const res = await fetch(`/api/admin/job-applications/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    setSaving(false);
    if (!res.ok) return;
    const id = active.id;
    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, status: "reviewed" } : a)));
  }

  if (active) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold text-gray-900">Careers</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Applicants</p>

        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-wrap gap-8 text-sm">
            <p>
              Role: <span className="font-medium text-gray-900">{active.role}</span>
            </p>
            <p>
              Applied:{" "}
              <span className="font-medium text-gray-900">
                {new Date(active.createdAt).toLocaleDateString("en-US", {
                  month: "2-digit",
                  day: "2-digit",
                  year: "numeric",
                })}
              </span>
            </p>
            <p>
              Status: <span className={`font-medium ${statusTone[active.status]}`}>{statusLabel[active.status]}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-600">Applicant Name</p>
              <input readOnly defaultValue={active.fullName} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <input readOnly defaultValue={active.phone ?? "—"} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <input readOnly defaultValue={active.email} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-accent-500">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{active.cvFilename || "No CV on file"}</p>
                  {active.cvPreviewUrl && <p className="text-xs text-primary-600">✓ Uploaded</p>}
                </div>
              </div>
              {active.cvPreviewUrl && (
                <div className="flex shrink-0 items-center gap-4">
                  <a
                    href={active.cvPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600"
                  >
                    👁 View
                  </a>
                  {active.cvDownloadUrl && (
                    <a href={active.cvDownloadUrl} className="text-sm font-medium text-primary-600">
                      ⬇ Download
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="rounded-full border border-gray-200 px-8 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Back to Applicants
            </button>
            {active.status === "received" && (
              <button
                type="button"
                disabled={saving}
                onClick={markReviewed}
                className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Mark Reviewed"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Careers</h1>

      <div className="mb-6 flex gap-8 border-b border-gray-200 text-sm font-medium">
        {(["applicants", "postings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-3 ${
              tab === t ? "border-primary-600 text-primary-700" : "border-transparent text-gray-400"
            }`}
          >
            {t === "applicants" ? "Applicants" : "Job Postings"}
          </button>
        ))}
      </div>

      {tab === "postings" ? (
        <JobPostingsPanel initialPostings={initialPostings} />
      ) : (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-800">Applicants</h2>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | Applicant["status"])}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="received">New</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          {applicants.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No applications submitted yet.</p>
          ) : filteredApplicants.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No applicants match your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="py-3 pr-4">SN</th>
                    <th className="py-3 pr-4">Applicant</th>
                    <th className="py-3 pr-4">Role</th>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplicants.map((a, i) => (
                    <tr
                      key={a.id}
                      onClick={() => setActiveId(a.id)}
                      className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                      <td className="py-3 pr-4 text-gray-800">{a.fullName}</td>
                      <td className="py-3 pr-4 text-gray-500">{a.role}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          year: "numeric",
                        })}
                      </td>
                      <td className={`py-3 font-medium ${statusTone[a.status]}`}>{statusLabel[a.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
