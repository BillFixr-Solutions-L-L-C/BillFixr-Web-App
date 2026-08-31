import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BillFixr - Dashboard",
};

const EXEMPT_PATHS = ["/dashboard/settings", "/dashboard/logout"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let status: "active" | "suspended" = "active";
  let avatarUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, status, address, city, postal_code, country, profile_completion_exempt, avatar_url")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? "";
    status = profile?.status ?? "active";
    avatarUrl = profile?.avatar_url ?? null;

    const needsCompletion =
      profile &&
      !profile.profile_completion_exempt &&
      (!profile.address || !profile.city || !profile.postal_code || !profile.country);

    if (needsCompletion) {
      const pathname = (await headers()).get("x-pathname") ?? "";
      if (!EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
        redirect("/dashboard/settings?complete_profile=1");
      }
    }
  }

  return (
    <DashboardShell user={{ name, status, avatarUrl }}>{children}</DashboardShell>
  );
}
