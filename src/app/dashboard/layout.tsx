import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BillFixr - Dashboard",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let status: "active" | "suspended" = "active";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, status")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? "";
    status = profile?.status ?? "active";
  }

  return (
    <DashboardShell user={{ name, status }}>{children}</DashboardShell>
  );
}
