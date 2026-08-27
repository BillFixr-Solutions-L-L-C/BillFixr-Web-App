import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BillFixr - Admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let roleName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, roles(name)")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? "";
    roleName = (profile as unknown as { roles: { name: string } | null } | null)?.roles?.name ?? "";
  }

  return <AdminShell user={{ name, roleName }}>{children}</AdminShell>;
}
