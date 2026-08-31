"use client";

import { useState } from "react";

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

type FormState = {
  title: string;
  location: string;
  listingDescription: string;
  responsibilities: string;
  requirements: string;
  benefit: string;
  status: "open" | "closed";
};

const EMPTY_FORM: FormState = {
  title: "",
  location: "",
  listingDescription: "",
  responsibilities: "",
  requirements: "",
  benefit: "",
  status: "open",
};

function toFormState(posting: Posting): FormState {
  return {
    title: posting.title,
    location: posting.location,
    listingDescription: posting.listingDescription,
    responsibilities: posting.responsibilities.join("\n"),
    requirements: posting.requirements.join("\n"),
    benefit: posting.benefit ?? "",
    status: posting.status,
  };
}

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function JobPostingsPanel({ initialPostings }: { initialPostings: Posting[] }) {
  const [postings, setPostings] = useState(initialPostings);
  const [editing, setEditing] = useState<Posting | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setEditing("new");
  }

  function startEdit(posting: Posting) {
    setForm(toFormState(posting));
    setError("");
    setEditing(posting);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      title: form.title,
      location: form.location,
      listingDescription: form.listingDescription,
      responsibilities: linesToArray(form.responsibilities),
      requirements: linesToArray(form.requirements),
      benefit: form.benefit,
      status: form.status,
    };

    const isNew = editing === "new";
    const url = isNew ? "/api/admin/job-postings" : `/api/admin/job-postings/${(editing as Posting).id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? { ...body, status: undefined } : body),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save posting.");
      return;
    }

    if (isNew) {
      const { id } = await res.json();
      setPostings((prev) => [{ id, ...body, benefit: body.benefit || null, status: "open" }, ...prev]);
    } else {
      const id = (editing as Posting).id;
      setPostings((prev) =>
        prev.map((p) => (p.id === id ? { id, ...body, benefit: body.benefit || null } : p)),
      );
    }
    setEditing(null);
  }

  async function toggleStatus(posting: Posting) {
    const nextStatus = posting.status === "open" ? "closed" : "open";
    const res = await fetch(`/api/admin/job-postings/${posting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: posting.title,
        location: posting.location,
        listingDescription: posting.listingDescription,
        responsibilities: posting.responsibilities,
        requirements: posting.requirements,
        benefit: posting.benefit,
        status: nextStatus,
      }),
    });
    if (!res.ok) return;
    setPostings((prev) => prev.map((p) => (p.id === posting.id ? { ...p, status: nextStatus } : p)));
  }

  if (editing) {
    const isNew = editing === "new";
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">{isNew ? "New Posting" : "Edit Posting"}</h2>
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-gray-600">Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Location</label>
            <input
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-gray-600">Listing Description</label>
            <textarea
              required
              rows={2}
              value={form.listingDescription}
              onChange={(e) => setForm({ ...form, listingDescription: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Responsibilities (one per line)</label>
            <textarea
              rows={5}
              value={form.responsibilities}
              onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Requirements (one per line)</label>
            <textarea
              rows={5}
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Benefit</label>
            <input
              value={form.benefit}
              onChange={(e) => setForm({ ...form, benefit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          {!isNew && (
            <div>
              <label className="text-sm text-gray-600">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as "open" | "closed" })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

          {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-full border border-gray-200 px-8 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Job Postings</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          + New Posting
        </button>
      </div>

      {postings.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No job postings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">Title</th>
                <th className="py-3 pr-4">Location</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {postings.map((posting) => (
                <tr key={posting.id} className="border-t border-gray-50">
                  <td className="py-3 pr-4 text-gray-800">{posting.title}</td>
                  <td className="py-3 pr-4 text-gray-500">{posting.location}</td>
                  <td className={`py-3 pr-4 font-medium ${posting.status === "open" ? "text-primary-600" : "text-gray-400"}`}>
                    {posting.status === "open" ? "Open" : "Closed"}
                  </td>
                  <td className="flex justify-end gap-4 py-3">
                    <button type="button" onClick={() => startEdit(posting)} className="font-medium text-primary-600">
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleStatus(posting)} className="font-medium text-gray-500">
                      {posting.status === "open" ? "Close" : "Reopen"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
