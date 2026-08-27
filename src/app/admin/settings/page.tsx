import ManageAdmins, { type AdminRow, type RoleOption } from "@/components/admin/ManageAdmins";
import { createClient } from "@/lib/supabase/server";

type AdminProfile = {
  id: string;
  name: string;
  email: string;
  role_id: string | null;
  roles: { name: string } | null;
};

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: adminProfiles }, { data: roles }, { data: domainAccess }, { data: canDelete }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, role_id, roles(name)").eq("role", "admin").order("name"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("role_domain_access").select("role_id, access_level"),
    supabase.rpc("can_delete_accounts"),
  ]);

  const domainCounts = new Map<string, number>();
  for (const row of domainAccess ?? []) {
    if (row.access_level !== "none") {
      domainCounts.set(row.role_id, (domainCounts.get(row.role_id) ?? 0) + 1);
    }
  }

  const admins: AdminRow[] = ((adminProfiles ?? []) as unknown as AdminProfile[]).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    roleId: a.role_id,
    roleName: a.roles?.name ?? "Unassigned",
    domainsGranted: a.role_id ? (domainCounts.get(a.role_id) ?? 0) : 0,
  }));

  const roleOptions: RoleOption[] = roles ?? [];

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Settings</h1>
      <ManageAdmins
        admins={admins}
        roles={roleOptions}
        canDelete={Boolean(canDelete)}
        currentUserId={user?.id ?? ""}
      />
    </div>
  );
}
