"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type AdminRow = {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string;
  domainsGranted: number;
};

export type RoleOption = { id: string; name: string };

export default function ManageAdmins({
  admins,
  roles,
  canDelete,
  currentUserId,
}: {
  admins: AdminRow[];
  roles: RoleOption[];
  canDelete: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/invite-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, roleId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to invite admin");
      return;
    }
    setShowAdd(false);
    setName("");
    setEmail("");
    router.refresh();
  }

  async function changeRole(adminId: string, newRoleId: string) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role_id: newRoleId })
      .eq("id", adminId);
    setBusy(false);
    setEditingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function removeAdmin(adminId: string) {
    if (!confirm("This permanently deletes this admin account. Continue?")) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: adminId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete account");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Manage Admins</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Add new admin +
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {admins.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No admin accounts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4">SN</th>
                <th className="py-3 pr-4">Full name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Domains granted</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a, i) => (
                <tr key={a.id} className="border-t border-gray-50">
                  <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                  <td className="flex items-center gap-2 py-3 pr-4 text-gray-800">
                    <span className="h-7 w-7 rounded-full bg-primary-100" />
                    {a.name}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{a.email}</td>
                  <td className="py-3 pr-4 text-gray-800">
                    {editingId === a.id ? (
                      <select
                        autoFocus
                        defaultValue={a.roleId ?? ""}
                        disabled={busy}
                        onChange={(e) => changeRole(a.id, e.target.value)}
                        onBlur={() => setEditingId(null)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      a.roleName
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{a.domainsGranted}</td>
                  <td className="py-3 text-gray-400">
                    <button
                      type="button"
                      onClick={() => setEditingId(a.id)}
                      aria-label="Edit role"
                      className="mr-3 hover:text-gray-700"
                    >
                      ✎
                    </button>
                    {canDelete && a.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => removeAdmin(a.id)}
                        aria-label="Delete admin"
                        className="hover:text-red-600"
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              aria-label="Close"
              className="absolute right-6 top-6 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="font-serif text-xl font-bold text-gray-900">Add new admin</h2>
            <form onSubmit={addAdmin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="add-admin-name" className="text-sm text-gray-600">
                  Full name
                </label>
                <input
                  id="add-admin-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="add-admin-email" className="text-sm text-gray-600">
                  Email
                </label>
                <input
                  id="add-admin-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="add-admin-role" className="text-sm text-gray-600">
                  Role
                </label>
                <select
                  id="add-admin-role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {busy ? "Sending invite..." : "Send invite"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
