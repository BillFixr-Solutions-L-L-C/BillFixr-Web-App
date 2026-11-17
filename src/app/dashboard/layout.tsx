import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BillFixr - Dashboard",
};

// The mandatory-profile-completion redirect used to live here, but a
// redirect() thrown from a layout during a client-side navigation (the
// only kind of navigation that ever lands on /dashboard — login/signup/
// confirm all use router.push/replace, never a full page load) turned out
// to reliably render a permanently blank page in production. Moved to
// proxy.ts, where it's a real top-level HTTP redirect regardless of how
// the request arrived — see the comment there for the full story.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let status: "active" | "suspended" = "active";
  let avatarUrl: string | null = null;
  let initialNotifications: { id: string; type: string; message: string; read: boolean; created_at: string }[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, status, avatar_url")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? "";
    status = profile?.status ?? "active";
    avatarUrl = profile?.avatar_url ?? null;

    // The same query the admin layout has always run. RLS on
    // notifications is `user_id = auth.uid() or is_admin()`, so a
    // customer reading with their own session gets exactly their own
    // rows -- the table was never admin-only, nothing had ever written
    // a customer one.
    const { data: notifications } = await supabase
      .from("notifications")
      .select("id, type, message, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    initialNotifications = notifications ?? [];
  }

  return (
    <DashboardShell user={{ name, status, avatarUrl }} initialNotifications={initialNotifications}>
      {children}
    </DashboardShell>
  );
}
