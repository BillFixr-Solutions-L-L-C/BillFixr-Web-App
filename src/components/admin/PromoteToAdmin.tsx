"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RoleOption = { id: string; name: string };

export default function PromoteToAdmin({ userId, roles }: { userId: string; roles: RoleOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function promote() {
    if (!confirm("This grants admin access immediately. Continue?")) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/promote-to-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, roleId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to promote account");
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-primary-300 px-6 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50"
      >
        Promote to Admin
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-5">
      <p className="mb-3 text-sm font-semibold text-primary-900">Promote to Admin</p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={promote}
          disabled={busy}
          className="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? "Promoting..." : "Confirm Promotion"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
