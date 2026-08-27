"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type AccountRow = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  lastLogin: string;
  status: "Active" | "Suspended" | "Invited";
};

const statusTone: Record<AccountRow["status"], string> = {
  Active: "text-primary-600",
  Suspended: "text-purple-500",
  Invited: "text-accent-600",
};

export default function UserManagementTable({
  accounts,
  canDelete,
  currentUserId,
}: {
  accounts: AccountRow[];
  canDelete: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    if (!confirm("This permanently deletes this pending admin account. Continue?")) return;
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to revoke access");
      return;
    }
    router.refresh();
  }

  return (
    <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">User Account &amp; Access Control</h2>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No admin accounts yet.</p>
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
              {accounts.map((a) => (
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
                            onClick={() => revokeAccess(a.id)}
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
    </div>
  );
}
