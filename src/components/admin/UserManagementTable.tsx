"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";

export type AccountRow = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  lastLogin: string;
  status: "Active" | "Suspended" | "Invited";
};

export type RoleOption = { id: string; name: string };

const statusTone: Record<AccountRow["status"], string> = {
  Active: "text-primary-600",
  Suspended: "text-purple-500",
  Invited: "text-accent-600",
};

export default function UserManagementTable({
  accounts,
  roles,
  canDelete,
  currentUserId,
}: {
  accounts: AccountRow[];
  roles: RoleOption[];
  canDelete: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | AccountRow["status"]>("All");

  const [showAdd, setShowAdd] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRoleId, setAddRoleId] = useState(roles[0]?.id ?? "");

  const filteredAccounts = accounts.filter((a) => {
    if (statusFilter !== "All" && a.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setError("");
    const res = await fetch("/api/admin/invite-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName, email: addEmail, roleId: addRoleId }),
    });
    setAddBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to invite admin");
      return;
    }
    setShowAdd(false);
    setAddName("");
    setAddEmail("");
    router.refresh();
  }

  async function reactivate(id: string) {
    setBusyId(id);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function resendInvite(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/resend-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to resend invite");
      return;
    }
    router.refresh();
  }

  async function revokeAccess(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    setBusyId(null);
    setConfirmingRevokeId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to revoke access");
      return;
    }
    router.refresh();
  }

  return (
    <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">User Account &amp; Access Control</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Add new admin +
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "All" | AccountRow["status"])}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
        >
          <option value="All">All statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Invited">Invited</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No admin accounts yet.</p>
      ) : filteredAccounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No accounts match your search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Last Login</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a) => (
                <tr key={a.id} className="border-t border-gray-50">
                  <td className="flex items-center gap-2 py-2.5 pr-4 text-gray-800">
                    <span className="h-6 w-6 rounded-full bg-primary-100" />
                    {a.name}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">{a.email}</td>
                  <td className="py-2.5 pr-4 text-gray-800">{a.roleName}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{a.lastLogin}</td>
                  <td className={`py-2.5 pr-4 font-medium ${statusTone[a.status]}`}>{a.status}</td>
                  <td className="py-2.5">
                    {a.status === "Active" && (
                      <Link
                        href="/admin/settings"
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </Link>
                    )}
                    {a.status === "Suspended" && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => reactivate(a.id)}
                        className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-600 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                    {a.status === "Invited" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === a.id}
                          onClick={() => resendInvite(a.id)}
                          className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-600 disabled:opacity-50"
                        >
                          Resend Invite
                        </button>
                        {canDelete && a.id !== currentUserId && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => setConfirmingRevokeId(a.id)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-500 disabled:opacity-50"
                          >
                            Revoke Access
                          </button>
                        )}
                      </div>
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
                <label htmlFor="um-add-admin-name" className="text-sm text-gray-600">
                  Full name
                </label>
                <input
                  id="um-add-admin-name"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="um-add-admin-email" className="text-sm text-gray-600">
                  Email
                </label>
                <input
                  id="um-add-admin-email"
                  required
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="um-add-admin-role" className="text-sm text-gray-600">
                  Role
                </label>
                <select
                  id="um-add-admin-role"
                  value={addRoleId}
                  onChange={(e) => setAddRoleId(e.target.value)}
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
                disabled={addBusy}
                className="w-full rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {addBusy ? "Sending invite..." : "Send invite"}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmingRevokeId !== null}
        title="Revoke this invite?"
        message="This permanently deletes this pending admin account."
        confirmLabel="Yes, Revoke Access"
        danger
        busy={busyId === confirmingRevokeId}
        onConfirm={() => confirmingRevokeId && revokeAccess(confirmingRevokeId)}
        onCancel={() => setConfirmingRevokeId(null)}
      />
    </div>
  );
}
