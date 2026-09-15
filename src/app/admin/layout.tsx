import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, type AccessLevel, type Domain } from "@/lib/domainAccess";

const SIDEBAR_DOMAINS = ["client_data", "finance", "hr", "system", "ai_pipeline"] as const satisfies readonly Domain[];

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
  let initialNotifications: { id: string; type: string; message: string; read: boolean; created_at: string }[] = [];
  const domainAccess: Partial<Record<Domain, AccessLevel>> = {};
  if (user) {
    const levels = await Promise.all(SIDEBAR_DOMAINS.map((domain) => getDomainAccess(supabase, domain)));
    SIDEBAR_DOMAINS.forEach((domain, i) => {
      domainAccess[domain] = levels[i];
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, roles(name)")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? "";
    roleName = (profile as unknown as { roles: { name: string } | null } | null)?.roles?.name ?? "";

    const { data: notifications } = await supabase
      .from("notifications")
      .select("id, type, message, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    initialNotifications = notifications ?? [];
  }

  return (
    <AdminShell user={{ name, roleName }} initialNotifications={initialNotifications} domainAccess={domainAccess}>
      {children}
    </AdminShell>
  );
}
