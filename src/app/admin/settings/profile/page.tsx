import { redirect } from "next/navigation";
import ProfileForm from "@/components/admin/ProfileForm";
import { createClient } from "@/lib/supabase/server";

export default async function AdminProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, roles(name)")
    .eq("id", user.id)
    .single();

  const roleName =
    (profile as unknown as { roles: { name: string } | null } | null)?.roles?.name ?? "Unassigned";

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Settings</h1>

      <div className="max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <div className="h-24 w-24 rounded-full bg-gray-100" />
        <ProfileForm
          userId={user.id}
          initialName={profile?.name ?? ""}
          email={profile?.email ?? user.email ?? ""}
          roleName={roleName}
        />
      </div>
    </div>
  );
}
