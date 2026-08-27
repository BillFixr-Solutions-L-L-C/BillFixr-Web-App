import UserManagementTable, { type AccountRow } from "@/components/admin/UserManagementTable";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminProfile = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  role_id: string | null;
  roles: { name: string } | null;
};

export default async function UserManagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: adminProfiles }, { data: roles }, { data: domainAccess }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, status, role_id, roles(name)").eq("role", "admin"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("role_domain_access").select("role_id, domain, access_level"),
  ]);

  const domainCounts = new Map<string, number>();
  const domainSet = new Set<string>();
  for (const row of domainAccess ?? []) {
    domainSet.add(row.domain);
    if (row.access_level !== "none") {
      domainCounts.set(row.role_id, (domainCounts.get(row.role_id) ?? 0) + 1);
    }
  }
  const domainTotal = domainSet.size;

  const admin = createAdminClient();
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const authById = new Map(authList?.users.map((u) => [u.id, u]) ?? []);

  const accounts: AccountRow[] = ((adminProfiles ?? []) as unknown as AdminProfile[]).map((p) => {
    const authUser = authById.get(p.id);
    const confirmed = Boolean(authUser?.email_confirmed_at);
    const status: AccountRow["status"] = !confirmed ? "Invited" : p.status === "suspended" ? "Suspended" : "Active";
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      roleName: p.roles?.name ?? "Unassigned",
      lastLogin: authUser?.last_sign_in_at
        ? new Date(authUser.last_sign_in_at).toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })
        : "Never",
      status,
    };
  });

  const counts = { Active: 0, Suspended: 0, Invited: 0 };
  for (const a of accounts) counts[a.status] += 1;

  const { data: canDelete } = await supabase.rpc("can_delete_accounts");

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">User Management Dashboard</h1>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <UserManagementTable accounts={accounts} canDelete={Boolean(canDelete)} currentUserId={user?.id ?? ""} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">User Activity &amp; Login Logs</h2>
            <p className="text-xs text-gray-400">Activity logging isn&apos;t enabled yet.</p>
          </div>

          <div className="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">System Roles &amp; Permissions</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-gray-400">
                    <th className="py-1.5 font-medium">Role</th>
                    <th className="py-1.5 font-medium">Domains granted</th>
                  </tr>
                </thead>
                <tbody>
                  {(roles ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-800">{r.name}</td>
                      <td className="py-1.5 text-gray-500">
                        {domainCounts.get(r.id) ?? 0} / {domainTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">User Account Summary</h2>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-primary-500" /> Active {counts.Active}
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Suspended {counts.Suspended}
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-accent-500" /> Invited {counts.Invited}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
